"""
OpticNova — FastAPI Backend v2
DR detection + Auth + Patient management + Admin panel
"""

import os, uuid, json, secrets
import torch
import numpy as np
import cv2
import io
from sklearn.cluster import KMeans

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import timm

import database as db

app = FastAPI(title="OpticNova API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    db.init_db()
    load_models()

# ══════════════════════════════════════════════════════════════════════════════
# DR MODELS
# ══════════════════════════════════════════════════════════════════════════════
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR   = os.path.join(BASE_DIR, "models")
NUM_CLASSES = 5
device      = torch.device("cpu")
models_registry = {}

MODEL_FILES = {
    "efficientnet_b3":               "efficientnet_b3_balanced_best.pth",
    "convnext_tiny":                 "convnext_tiny_balanced_best.pth",
    "resnet50":                      "resnet50_balanced_best.pth",
    "swin_tiny_patch4_window7_224":  "swin_tiny_patch4_window7_224_balanced_best.pth",
}

def load_models():
    for arch, filename in MODEL_FILES.items():
        path = os.path.join(MODEL_DIR, filename)
        if not os.path.exists(path):
            print(f"[WARN] Model not found: {path}"); continue
        try:
            model = timm.create_model(arch, pretrained=False, num_classes=NUM_CLASSES)
            state = torch.load(path, map_location=device)
            if isinstance(state, dict) and "model_state_dict" in state:
                state = state["model_state_dict"]
            model.load_state_dict(state)
            model.eval()
            models_registry[arch] = model
            print(f"[OK] Loaded: {arch}")
        except Exception as e:
            print(f"[ERR] {arch}: {e}")
    print(f"[INFO] {len(models_registry)}/4 models loaded")


# ══════════════════════════════════════════════════════════════════════════════
# PREPROCESSING  (matches preprocess.py exactly)
# ══════════════════════════════════════════════════════════════════════════════
_FINAL_SIZE         = 600
_DEL_PADDING_RATIO  = 0.002
_CROP_PADDING_RATIO = 0.02
_THRESHOLD_LOW      = 7
_THRESHOLD_HIGH     = 180
_MIN_RADIUS_RATIO   = 0.33
_MAX_RADIUS_RATIO   = 0.6
_KMEANS_CLUSTERS    = 8

def _del_black_or_white(img):
    if img.ndim == 2:
        img = np.expand_dims(img, axis=-1)
    h, w = img.shape[:2]
    padding = int(min(w, h) * _DEL_PADDING_RATIO)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = (gray > _THRESHOLD_LOW) & (gray < _THRESHOLD_HIGH)
    coords = np.argwhere(mask)
    if coords.size == 0:
        return img
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0)
    y0, x0 = max(0, y0 - padding), max(0, x0 - padding)
    y1, x1 = min(h, y1 + padding), min(w, x1 + padding)
    return img[y0:y1, x0:x1]

def _detect_xyr(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    min_r = int(min(h, w) * _MIN_RADIUS_RATIO)
    max_r = int(min(h, w) * _MAX_RADIUS_RATIO)
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1, minDist=450,
        param1=120, param2=32, minRadius=min_r, maxRadius=max_r
    )
    if circles is not None:
        circles = np.round(circles[0, :]).astype("int")
        return circles[0]
    return w // 2, h // 2, min(h, w) // 2

def _crop_xyr(img, x, y, r):
    h, w = img.shape[:2]
    padding = int(min(h, w) * _CROP_PADDING_RATIO)
    left   = max(0, x - r - padding)
    right  = min(w, x + r + padding)
    top    = max(0, y - r - padding)
    bottom = min(h, y + r + padding)
    return img[top:bottom, left:right]

def _ben_graham(img, sigmaX=10):
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (_FINAL_SIZE, _FINAL_SIZE))
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0, 0), sigmaX), -4, 128)
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

def _apply_clahe(img):
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    b, g, r = cv2.split(img)
    return cv2.merge([clahe.apply(b), clahe.apply(g), clahe.apply(r)])

def _apply_kmeans(img, k=8):
    if k == 0:
        return img
    data = img.reshape((-1, 3))
    kmeans = KMeans(n_clusters=k, random_state=0, n_init=1, max_iter=10)
    labels = kmeans.fit_predict(data)
    centers = np.uint8(kmeans.cluster_centers_)
    return centers[labels].reshape(img.shape)

def preprocess_image(image_bytes: bytes) -> torch.Tensor:
    # 1. Decode bytes → BGR image
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    # 2. Crop dark/bright borders
    img = _del_black_or_white(img)

    # 3. Detect retinal disc and crop to it
    x, y, r = _detect_xyr(img)
    img = _crop_xyr(img, x, y, r)

    # 4. Resize to 600x600
    img = cv2.resize(img, (_FINAL_SIZE, _FINAL_SIZE))

    # 5. Ben Graham preprocessing
    img = _ben_graham(img)

    # 6. CLAHE contrast enhancement
    img = _apply_clahe(img)

    # 7. KMeans colour quantization
    img = _apply_kmeans(img, _KMEANS_CLUSTERS)

    # 8. Resize to 224x224 (matches val_test_transform A.Resize)
    img = cv2.resize(img, (224, 224))

    # 9. BGR → RGB, normalize (matches A.Normalize mean/std)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype(np.float32) / 255.0
    img = (img - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / \
                 np.array([0.229, 0.224, 0.225], dtype=np.float32)

    # 10. HWC → CHW, add batch dim
    return torch.tensor(img).permute(2, 0, 1).unsqueeze(0).float()


# ══════════════════════════════════════════════════════════════════════════════
# INFERENCE
# ══════════════════════════════════════════════════════════════════════════════
SEVERITY_LABELS = {0:"No DR", 1:"Mild DR", 2:"Moderate DR", 3:"Severe DR", 4:"Proliferative DR"}

def run_inference(tensor):
    if not models_registry:
        raise HTTPException(503, "No models loaded")
    all_probs, individual = [], {}
    with torch.no_grad():
        for arch, model in models_registry.items():
            probs = torch.softmax(model(tensor), dim=1).squeeze().numpy()
            pred  = int(np.argmax(probs))
            individual[arch] = {
                "severity":      pred,
                "confidence":    float(probs[pred]),
                "probabilities": probs.tolist()
            }
            all_probs.append(probs)

    avg = np.mean(all_probs, axis=0)

    # Heuristic: boost class 3 (Severe) when model is split between
    # Moderate (2) and Proliferative (4) — both competing closely
    if avg[2] > 0.28 and avg[4] > 0.28 and avg[3] > 0.18:
        avg[3] *= 1.3
        avg = avg / avg.sum()  # renormalize so probs sum to 1

    epred = int(np.argmax(avg))
    return {
        "individual_predictions": individual,
        "ensemble_prediction": {
            "severity":      epred,
            "severity_text": SEVERITY_LABELS[epred],
            "confidence":    float(avg[epred])
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# AUTH HELPERS
# ══════════════════════════════════════════════════════════════════════════════
ADMIN_EMAIL = "admin@opticnova.com"
ADMIN_PASS  = "admin123"

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    if token == "admin_static_token":
        return {"id":"admin","name":"System Admin","email":ADMIN_EMAIL,"role":"admin"}
    doctor = db.get_session(token)
    if not doctor:
        raise HTTPException(401, "Invalid or expired session")
    doctor["role"] = "doctor"
    return doctor


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════
class SignupRequest(BaseModel):
    name: str; email: str; password: str
    hospital: str; specialization: str; reg_no: str

class LoginRequest(BaseModel):
    email: str; password: str

class PatientCreate(BaseModel):
    name: str; age: int; gender: str; phone: str
    diabetes_duration: Optional[str] = ""
    notes: Optional[str] = ""

class VisitCreate(BaseModel):
    patient_id: str; image_name: str
    severity: int; severity_text: str; confidence: float
    individual_results: dict
    clinical_notes: Optional[str] = ""


# ══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/")
def root():
    return {"message":"OpticNova API v2","models_loaded":len(models_registry),"device":str(device)}

@app.get("/health")
def health():
    return {"status":"ok","models_loaded":len(models_registry),"db":db.get_stats()}


# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════
import re as _re

def _validate_password(p: str):
    """Returns error string or None if valid."""
    if len(p) < 8:            return "Password must be at least 8 characters"
    if not _re.search(r"[A-Z]", p): return "Password must contain at least one uppercase letter"
    if not _re.search(r"[a-z]", p): return "Password must contain at least one lowercase letter"
    if not _re.search(r"[0-9]", p): return "Password must contain at least one number"
    if not _re.search(r"[!@#$%^&*()_+\-=\[\]{};:\'\",./<>?]", p):
        return "Password must contain at least one special character (!@#$%...)"
    return None

@app.post("/auth/signup")
def signup(req: SignupRequest):
    pwd_err = _validate_password(req.password)
    if pwd_err:
        raise HTTPException(400, pwd_err)
    doctor_id = str(uuid.uuid4())
    ok, msg = db.create_doctor(doctor_id, req.name, req.email, req.password,
                               req.hospital, req.specialization, req.reg_no)
    if not ok:
        raise HTTPException(400, msg)
    token = secrets.token_hex(32)
    db.create_session(token, doctor_id)
    return {
        "token": token, "role": "doctor",
        "doctor": {"id":doctor_id,"name":req.name,"email":req.email,
                   "hospital":req.hospital,"specialization":req.specialization,"reg_no":req.reg_no}
    }

@app.post("/auth/login")
def login(req: LoginRequest):
    if req.email == ADMIN_EMAIL and req.password == ADMIN_PASS:
        return {"token":"admin_static_token","role":"admin","doctor":None}
    doctor = db.login_doctor(req.email, req.password)
    if not doctor:
        raise HTTPException(401, "Invalid email or password")
    token = secrets.token_hex(32)
    db.create_session(token, doctor["id"])
    safe = {k:v for k,v in doctor.items() if k != "password_hash"}
    return {"token":token,"role":"doctor","doctor":safe}

@app.post("/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        db.delete_session(authorization.split(" ",1)[1])
    return {"message":"Logged out"}

@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return user


# ══════════════════════════════════════════════════════════════════════════════
# PATIENTS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/patients")
def list_patients(search: Optional[str] = None, user=Depends(get_current_user)):
    is_admin = user["role"] == "admin"
    return db.search_patients(search, user["id"], is_admin) if search else db.get_patients(user["id"], is_admin)

@app.post("/patients")
def add_patient(req: PatientCreate, user=Depends(get_current_user)):
    if user["role"] == "admin":
        raise HTTPException(403, "Admin cannot add patients")
    pid = str(uuid.uuid4())
    db.create_patient(pid, req.name, req.age, req.gender, req.phone,
                      req.diabetes_duration or "", req.notes or "", user["id"])
    return db.get_patient(pid)

@app.get("/patients/{patient_id}")
def get_patient(patient_id: str, user=Depends(get_current_user)):
    p = db.get_patient(patient_id)
    if not p: raise HTTPException(404, "Patient not found")
    if user["role"] != "admin" and p["doctor_id"] != user["id"]:
        raise HTTPException(403, "Access denied")
    return p

@app.get("/patients/{patient_id}/visits")
def patient_visits(patient_id: str, user=Depends(get_current_user)):
    p = db.get_patient(patient_id)
    if not p: raise HTTPException(404, "Patient not found")
    if user["role"] != "admin" and p["doctor_id"] != user["id"]:
        raise HTTPException(403, "Access denied")
    visits = db.get_visits_for_patient(patient_id)
    for v in visits:
        if isinstance(v.get("individual_results"), str):
            v["individual_results"] = json.loads(v["individual_results"])
    return visits


# ══════════════════════════════════════════════════════════════════════════════
# VISITS
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/visits")
def save_visit(req: VisitCreate, user=Depends(get_current_user)):
    if user["role"] == "admin":
        raise HTTPException(403, "Admin cannot create visits")
    p = db.get_patient(req.patient_id)
    if not p: raise HTTPException(404, "Patient not found")
    if p["doctor_id"] != user["id"]:
        raise HTTPException(403, "Patient belongs to another doctor")
    vid = str(uuid.uuid4())
    db.create_visit(vid, req.patient_id, user["id"], req.image_name,
                    req.severity, req.severity_text, req.confidence,
                    json.dumps(req.individual_results), req.clinical_notes or "")
    return {"id":vid,"message":"Visit saved"}

@app.get("/visits")
def list_visits(user=Depends(get_current_user)):
    visits = db.get_all_visits() if user["role"]=="admin" else db.get_visits_for_doctor(user["id"])
    for v in visits:
        if isinstance(v.get("individual_results"), str):
            v["individual_results"] = json.loads(v["individual_results"])
    return visits


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/admin/doctors")
def admin_doctors(user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    return db.get_all_doctors()

@app.post("/admin/doctors")
def admin_add_doctor(req: SignupRequest, user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    pwd_err = _validate_password(req.password)
    if pwd_err: raise HTTPException(400, pwd_err)
    doctor_id = str(uuid.uuid4())
    ok, msg = db.create_doctor(doctor_id, req.name, req.email, req.password,
                               req.hospital, req.specialization, req.reg_no)
    if not ok: raise HTTPException(400, msg)
    return {"id":doctor_id,"name":req.name,"email":req.email,
            "hospital":req.hospital,"specialization":req.specialization,"reg_no":req.reg_no}

@app.delete("/admin/doctors/{doctor_id}")
def admin_delete_doctor(doctor_id: str, user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    db.delete_doctor(doctor_id)
    return {"message":"Doctor removed successfully"}

@app.get("/admin/stats")
def admin_stats(user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    return db.get_stats()

@app.get("/admin/severity-distribution")
def severity_distribution(user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    return db.get_severity_distribution()

@app.get("/admin/recent-activity")
def recent_activity(user=Depends(get_current_user)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    return db.get_recent_activity(10)


# ══════════════════════════════════════════════════════════════════════════════
# DR PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

def _is_retinal_image(image_bytes: bytes) -> tuple[bool, str]:
    """
    Validates whether the uploaded image is likely a retinal fundus photograph.
    Returns (is_valid, reason).

    Fundus images have 3 characteristics:
      1. Large dark border (black background) — dark_ratio >= 0.10
      2. Warm reddish/orange tones           — mean_red >= 40
      3. Sufficient colour saturation        — mean_sat >= 15
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        return False, "Could not read image file. Please upload a valid PNG or JPEG."

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    dark_ratio = float(np.sum(gray < 30)) / gray.size   # fraction of near-black pixels
    mean_sat   = float(np.mean(hsv[:, :, 1]))            # mean saturation (0–255)
    mean_red   = float(np.mean(img[:, :, 2]))            # mean red channel (BGR)

    if dark_ratio < 0.10:
        return False, "Invalid image. Please upload a retinal fundus photograph."
    if mean_sat < 15:
        return False, "Invalid image. Please upload a retinal fundus photograph."
    if mean_red < 40:
        return False, "Invalid image. Please upload a retinal fundus photograph."

    return True, "ok"


@app.post("/predict-all")
async def predict_all(file: UploadFile = File(...)):
    contents = await file.read()

    # ── Step 1: Validate this is a retinal image ──────────────
    valid, reason = _is_retinal_image(contents)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)
    # ─────────────────────────────────────────────────────────

    # ── Step 2: Preprocess and run inference ──────────────────
    try:
        tensor = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(400, f"Could not process image: {e}")

    result = run_inference(tensor)
    return {"success": True, **result, "message": f"Ensemble of {len(models_registry)} models"}
