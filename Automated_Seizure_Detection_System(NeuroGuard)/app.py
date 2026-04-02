import streamlit as st
import numpy as np
import joblib
import mne
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import tempfile
import os
import xgboost as xgb
import tensorflow as tf
import pywt
from scipy.signal import welch, stft
from datetime import timedelta, datetime

# ==========================================
# 1. PAGE CONFIGURATION
# ==========================================
st.set_page_config(
    page_title="NeuroGuard: Final Edition", 
    page_icon="🧠", 
    layout="wide"
)

st.title("🧠 NeuroGuard: Seizure Zone Detection")
st.markdown("""
**The "Tri-Brid" Ensemble Architecture:**
* **XGBoost (35%):** Statistical Math (Line Length, Variance)
* **Random Forest (30%):** Logical Validation
* **Wavelet SVM (15%):** Frequency Energy (Alpha/Beta Bands)
* **Spectrogram 2D-CNN (25%):** Visual Pattern Recognition (Deep Learning)
""")

# ==========================================
# 2. CONFIGURATION
# ==========================================
WINDOW_DURATION = 5  # seconds
TARGET_RATE = 256    # Hz

# ==========================================
# 3. LOAD MODELS
# ==========================================
@st.cache_resource
def load_models():
    models = {}
    
    # 1. XGBoost
    try:
        models['xgb'] = joblib.load('xgboost_seizure_model.json')
        print("✅ XGBoost Loaded")
    except:
        models['xgb'] = None
        st.warning("⚠️ XGBoost missing.")
    
    # 2. Random Forest
    try:
        models['rf'] = joblib.load('rf_chb_model.json') 
        print("✅ Random Forest Loaded")
    except:
        models['rf'] = None
        st.warning("⚠️ Random Forest missing.")

    # 3. SVM (Wavelet Version)
    try:
        models['svm'] = joblib.load('svm_chb_model.json') 
        print("✅ SVM (Wavelet) Loaded")
    except:
        models['svm'] = None
        st.warning("⚠️ SVM missing.")
        
    # 4. 2D-CNN (Spectrogram Version)
    try:
        models['cnn'] = tf.keras.models.load_model('cnn_spectrogram_model.h5')
        print("✅ 2D-CNN (Spectrogram) Loaded")
    except:
        models['cnn'] = None
        st.warning("⚠️ 2D-CNN missing.")
        
    return models

models = load_models()

# ==========================================
# 4A. FEATURE 1: STANDARD STATS (XGB/RF)
# ==========================================
def extract_standard_features(window_data, fs):
    if window_data.ndim == 2: ch = window_data[0] 
    else: ch = window_data    
        
    line_len = np.sum(np.abs(np.diff(ch)))
    energy = np.sum(ch ** 2)
    variance = np.var(ch)
    zero_crossings = np.sum(np.diff(np.sign(ch)) != 0)
    peak_to_peak = np.ptp(ch)
    rms = np.sqrt(np.mean(ch**2))
    
    freqs, psd = welch(ch, fs, nperseg=fs)
    delta = np.sum(psd[(freqs >= 0.5) & (freqs < 4)])
    theta = np.sum(psd[(freqs >= 4) & (freqs < 8)])
    alpha = np.sum(psd[(freqs >= 8) & (freqs < 13)])
    beta  = np.sum(psd[(freqs >= 13) & (freqs < 30)])
    gamma = np.sum(psd[(freqs >= 30) & (freqs < 40)])
    
    return np.array([line_len, energy, variance, zero_crossings, 
                     peak_to_peak, rms, delta, theta, alpha, beta, gamma]).reshape(1, -1)

# ==========================================
# 4B. FEATURE 2: WAVELETS (SVM)
# ==========================================
def extract_wavelet_features(window_data):
    if window_data.ndim == 2: data = window_data[0] 
    else: data = window_data

    try:
        coeffs = pywt.wavedec(data, 'db4', level=5)
    except:
        return np.zeros((1, 16))

    features = []
    for coef in coeffs:
        energy = np.sum(coef ** 2) / (len(coef) + 1e-9)
        p = np.abs(coef) ** 2
        p = p / (np.sum(p) + 1e-9)
        entropy = -np.sum(p * np.log(p + 1e-9))
        features.extend([energy, entropy])
        
    features.append(np.mean(data))
    features.append(np.std(data))
    features.append(np.max(data))
    features.append(np.min(data))
    
    return np.array(features).reshape(1, -1)

# ==========================================
# 4C. FEATURE 3: SPECTROGRAM IMAGE (2D-CNN)
# ==========================================
def create_spectrogram(window_data, fs):
    if window_data.ndim == 2: data = window_data[0] 
    else: data = window_data
    
    f, t, Zxx = stft(data, fs, nperseg=128, noverlap=64)
    spectrogram = np.abs(Zxx)
    spectrogram = np.log1p(spectrogram) 
    return spectrogram[np.newaxis, ..., np.newaxis]

# ==========================================
# 5. SIGNAL PROCESSING CORE (BATCH OPTIMIZED)
# ==========================================
def process_file(raw, channel_name, user_threshold):
    # Setup Time
    start_time = raw.info['meas_date']
    if start_time is None:
        start_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_time = start_time.replace(tzinfo=None)

    raw_ch = raw.copy().pick_channels([channel_name])
    raw_ch.filter(0.5, 60.0, verbose=False)
    data = raw_ch.get_data()[0] * 1e6 
    sfreq = raw_ch.info['sfreq']
    
    samples_per_window = int(WINDOW_DURATION * sfreq)
    total_windows = len(data) // samples_per_window
    
    # ---------------------------------------------------------
    # STEP 1: BATCH FEATURE EXTRACTION (The Gather Phase)
    # ---------------------------------------------------------
    std_feats_batch = []
    wave_feats_batch = []
    spec_feats_batch = []
    valid_windows = [] # To keep track of windows without massive artifacts
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    status_text.text("⚡ Extracting Features from entire file...")
    
    for i in range(total_windows):
        start = i * samples_per_window
        end = start + samples_per_window
        window = data[start:end]
        
        # Artifact Rejection
        if np.max(np.abs(window)) <= 500:
            # We use [0] to flatten the array so we can stack them later
            std_feats_batch.append(extract_standard_features(window, sfreq)[0])
            wave_feats_batch.append(extract_wavelet_features(window)[0])
            
            if models['cnn']:
                spec_feats_batch.append(create_spectrogram(window, sfreq)[0])
                
            valid_windows.append(i)
            
        if i % 10 == 0: progress_bar.progress(i / total_windows)
        
    # ---------------------------------------------------------
    # STEP 2: BATCH PREDICTION (The Bulldozer Phase)
    # ---------------------------------------------------------
    status_text.text("🧠 Running AI Models (Batch Mode)...")
    
    # Default everything to 0 probability
    p_xgb = np.zeros(total_windows)
    p_rf = np.zeros(total_windows)
    p_svm = np.zeros(total_windows)
    p_cnn = np.zeros(total_windows)
    
    if valid_windows:
        # Convert lists to massive numpy arrays
        X_std = np.array(std_feats_batch)
        X_wave = np.array(wave_feats_batch)
        
        # Predict all valid windows instantly
        if models['xgb']: p_xgb[valid_windows] = models['xgb'].predict_proba(X_std)[:, 1]
        if models['rf']:  p_rf[valid_windows]  = models['rf'].predict_proba(X_std)[:, 1]
        if models['svm']: p_svm[valid_windows] = models['svm'].predict_proba(X_wave)[:, 1]
        
        # CNN Batch Predict (This is where the massive speedup happens)
        if models['cnn'] and spec_feats_batch:
            X_spec = np.array(spec_feats_batch)
            preds = models['cnn'].predict(X_spec, batch_size=32, verbose=0)
            p_cnn[valid_windows] = preds[:, 0]
            
    progress_bar.empty()
    status_text.empty()

    # ---------------------------------------------------------
    # STEP 3: ASSEMBLY & SMOOTHING
    # ---------------------------------------------------------
    results = []
    raw_probs = []
    
    for i in range(total_windows):
        # Weighted Vote
        ensemble_prob = (p_xgb[i] * 0.35) + (p_rf[i] * 0.30) + (p_svm[i] * 0.15) + (p_cnn[i] * 0.25)
        ensemble_prob = min(ensemble_prob, 1.0)
        
        time_obj = start_time + timedelta(seconds=(i * WINDOW_DURATION))
        time_str = time_obj.strftime("%H:%M:%S")
        seconds = i * WINDOW_DURATION
        
        raw_probs.append(ensemble_prob)
        
        results.append({
            "TimeStr": time_str,
            "Seconds": seconds,
            "XGBoost": p_xgb[i],
            "RandomForest": p_rf[i],
            "SVM": p_svm[i],
            "CNN": p_cnn[i],
            "Raw_Ensemble": ensemble_prob,
            "Smoothed_Prob": 0.0, 
            "Status": "Normal"
        })

    # Rolling average of 5 windows (25 seconds)
    smoothing_window = 5 
    smoothed_probs = np.convolve(raw_probs, np.ones(smoothing_window)/smoothing_window, mode='same')
    
    seizure_events = []
    in_seizure = False
    start_event_sec = None
    start_event_str = None
    
    # Trigger ON: user_threshold
    # Trigger OFF: user_threshold - 0.10 (Hysteresis prevents flickering)
    on_trigger = user_threshold
    off_trigger = max(0.1, user_threshold - 0.10)
    
    for i in range(len(results)):
        prob = smoothed_probs[i]
        results[i]["Smoothed_Prob"] = prob
        
        if prob > on_trigger and not in_seizure:
            in_seizure = True
            start_event_sec = results[i]["Seconds"]
            start_event_str = results[i]["TimeStr"]
            
        elif prob < off_trigger and in_seizure:
            in_seizure = False
            duration = results[i]["Seconds"] - start_event_sec
            
            if duration >= 10:
                seizure_events.append({
                    "start_sec": start_event_sec, 
                    "end_sec": results[i]["Seconds"],
                    "start_str": start_event_str,
                    "end_str": results[i]["TimeStr"],
                    "duration": duration
                })
            
        results[i]["Status"] = "Seizure" if in_seizure else "Normal"
        
    if in_seizure:
        duration = results[-1]["Seconds"] - start_event_sec
        if duration >= 10:
            seizure_events.append({
                "start_sec": start_event_sec, 
                "end_sec": results[-1]["Seconds"],
                "start_str": start_event_str,
                "end_str": results[-1]["TimeStr"],
                "duration": duration
            })

    return pd.DataFrame(results), seizure_events, data

# ==========================================
# 6. USER INTERFACE
# ==========================================
st.sidebar.header("⚙️ Settings")
threshold = st.sidebar.slider("Sensitivity Threshold", 0.0, 1.0, 0.50, 0.05)
time_mode = st.sidebar.radio("Time Axis Format:", ["Seconds (0s, 5s...)", "Real Time (10:00:00...)"])

uploaded_file = st.file_uploader("📂 Upload EEG File (.edf)", type=["edf"])

if uploaded_file:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".edf") as tmp:
        tmp.write(uploaded_file.read())
        tmp_path = tmp.name

    try:
        with st.spinner("Processing..."):
            raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
        
        if int(raw.info['sfreq']) != TARGET_RATE:
            raw.resample(TARGET_RATE, npad="auto")
            
        channels = raw.ch_names
        selected_ch = st.selectbox("Select Brain Channel:", channels, index=0)
        
        st.subheader("Raw Signal Preview")
        st.line_chart(raw.copy().pick_channels([selected_ch]).get_data()[0, :500])
        
        if st.button("🚀 Analyze Signal"):
            # PASS THE SLIDER THRESHOLD HERE
            df, seizure_events, _ = process_file(raw, selected_ch, threshold)
            
            if not df.empty:
                st.divider()
                
                # Metrics
                total_dur = sum([e['duration'] for e in seizure_events])
                c1, c2, c3 = st.columns(3)
                c1.metric("Total Windows", len(df))
                c2.metric("Seizure Events", len(seizure_events), delta_color="inverse")
                c3.metric("Total Seizure Duration", f"{total_dur:.0f} sec")
                
                # Setup X-Axis
                use_seconds = "Seconds" in time_mode
                x_axis_col = "Seconds" if use_seconds else "TimeStr"
                
                # --- PLOT 1: SEIZURE ZONES ---
                st.subheader("📊 Seizure Zones (Smoothed Consensus)")
                fig = px.line(df, x=x_axis_col, y="Smoothed_Prob", 
                              title=f"Ensemble Consensus - {selected_ch}",
                              labels={"Smoothed_Prob": "Seizure Probability"},
                              range_y=[0, 1.1])
                
                fig.add_hline(y=threshold, line_dash="dash", line_color="black", annotation_text="Trigger")
                
                # Highlight Areas (Red Zones)
                if use_seconds:
                    for e in seizure_events:
                        fig.add_vrect(x0=e['start_sec'], x1=e['end_sec'], 
                                      fillcolor="red", opacity=0.2, 
                                      annotation_text="SEIZURE", annotation_position="top left")
                
                st.plotly_chart(fig, use_container_width=True)
                
                # --- PLOT 2: DEBUG MODEL VOTES ---
                st.subheader("🔍 Model Voting Breakdown")
                st.markdown("Inspect which model is flagging the seizure:")
                
                fig2 = go.Figure()
                fig2.add_trace(go.Scatter(x=df[x_axis_col], y=df["XGBoost"], mode='lines', name='XGBoost (Stats)'))
                fig2.add_trace(go.Scatter(x=df[x_axis_col], y=df["RandomForest"], mode='lines', name='RF (Logic)'))
                fig2.add_trace(go.Scatter(x=df[x_axis_col], y=df["SVM"], mode='lines', name='SVM (Wavelets)'))
                fig2.add_trace(go.Scatter(x=df[x_axis_col], y=df["CNN"], mode='lines', name='CNN (Vision)'))
                
                fig2.update_layout(title="Individual Model Confidence", hovermode="x unified")
                st.plotly_chart(fig2, use_container_width=True)
                
                # Timestamps List
                if seizure_events:
                    st.write("### 🕒 Detected Seizure Timestamps:")
                    for e in seizure_events:
                        st.warning(f"⚠️ Seizure detected from **{e['start_str']}** to **{e['end_str']}** (Duration: {e['duration']:.0f}s)")
                
                with st.expander("See Raw Data"):
                    st.dataframe(df)
                    
    except Exception as e:
        st.error(f"Error: {e}")
    finally:
        if os.path.exists(tmp_path): os.unlink(tmp_path)