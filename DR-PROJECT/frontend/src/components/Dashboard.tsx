import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

// ─── PDF Export ───────────────────────────────────────────────────────────────
async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf) return (window as any).jspdf.jsPDF;
  await new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
  return (window as any).jspdf.jsPDF;
}

async function exportAnalysisPDF(opts: {
  patient: { name: string; age: number; gender: string; phone: string; diabetes_duration?: string };
  doctor: { name: string; hospital: string; specialization: string; reg_no: string } | null;
  result: { ensemble_prediction: { severity: number; severity_text: string; confidence: number }; individual_predictions: Record<string, any> };
  imageSrc: string | null;
  clinicalNotes: string;
  date: string;
}) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const PL = 18; const PR = 18; const CW = W - PL - PR;
  let y = 0;

  const sevColors: Record<number, [number,number,number]> = {
    0:[5,150,105], 1:[37,99,235], 2:[217,119,6], 3:[234,88,12], 4:[220,38,38]
  };
  const sevLabels: Record<number,string> = {0:'No DR',1:'Mild DR',2:'Moderate DR',3:'Severe DR',4:'Proliferative DR'};
  const urgency: Record<number,string> = {0:'Routine - Annual screening',1:'Monitor - Review in 6 months',2:'Refer - Retinal specialist within 1-3 months',3:'Urgent - Referral within 2-4 weeks',4:'Emergency - Immediate vitreoretinal referral'};
  const sev = opts.result.ensemble_prediction.severity;
  const sevRGB = sevColors[sev] ?? [37,99,235];

  const hex = (r:number,g:number,b:number) => { doc.setFillColor(r,g,b); };

  // HEADER BAND
  hex(15,23,42); doc.rect(0,0,W,28,'F');
  hex(...sevRGB); doc.rect(0,28,W,2,'F');
  hex(37,99,235); doc.circle(PL+7, 14, 7, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('ON', PL+4.5, 15.5);
  doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('OpticNova', PL+17, 12);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(147,197,253);
  doc.text('AI-Powered Diabetic Retinopathy Detection System', PL+17, 18);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(156,163,175);
  const dateStr = new Date(opts.date).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  doc.text(`Report Generated: ${dateStr}`, W-PR, 12, { align:'right' });
  doc.text('CONFIDENTIAL - Clinical Use Only', W-PR, 18, { align:'right' });
  y = 38;

  // RESULT BANNER
  hex(...sevRGB); doc.roundedRect(PL, y, CW, 22, 3, 3, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(opts.result.ensemble_prediction.severity_text.toUpperCase(), PL+6, y+10);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Ensemble Confidence: ${(opts.result.ensemble_prediction.confidence*100).toFixed(1)}%`, PL+6, y+17);
  doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(urgency[sev] ?? '', W-PR-4, y+10, { align:'right' });
  y += 28;

  // TWO COLUMNS: Patient + Doctor
  const colW = (CW-6)/2;
  hex(239,246,255); doc.roundedRect(PL, y, colW, 34, 2, 2, 'F');
  doc.setDrawColor(191,219,254); doc.roundedRect(PL, y, colW, 34, 2, 2, 'S');
  doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(37,99,235);
  doc.text('PATIENT INFORMATION', PL+4, y+6);
  doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(opts.patient.name, PL+4, y+13);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(75,85,99);
  doc.text(`Age: ${opts.patient.age}  |  Gender: ${opts.patient.gender}`, PL+4, y+20);
  doc.text(`Phone: ${opts.patient.phone}`, PL+4, y+26);
  if (opts.patient.diabetes_duration) doc.text(`Diabetes Duration: ${opts.patient.diabetes_duration}`, PL+4, y+32);
  const dx = PL + colW + 6;
  hex(245,243,255); doc.roundedRect(dx, y, colW, 34, 2, 2, 'F');
  doc.setDrawColor(221,214,254); doc.roundedRect(dx, y, colW, 34, 2, 2, 'S');
  doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(124,58,237);
  doc.text('REFERRING CLINICIAN', dx+4, y+6);
  doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(opts.doctor?.name ?? 'N/A', dx+4, y+13);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(75,85,99);
  doc.text(opts.doctor?.hospital ?? '', dx+4, y+20);
  doc.text(opts.doctor?.specialization ?? '', dx+4, y+26);
  if (opts.doctor?.reg_no) doc.text(`Reg: ${opts.doctor.reg_no}`, dx+4, y+32);
  y += 40;

  // SEVERITY SCALE
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(17,24,39);
  doc.text('DR Severity Scale', PL, y+5);
  y += 8;
  const scaleW = CW/5 - 2;
  const scaleLabels = ['0 - No DR','1 - Mild','2 - Moderate','3 - Severe','4 - Proliferative'];
  const scaleColors: [number,number,number][] = [[5,150,105],[37,99,235],[217,119,6],[234,88,12],[220,38,38]];
  scaleLabels.forEach((label, i) => {
    const sx = PL + i*(scaleW+2);
    const isActive = i === sev;
    hex(...scaleColors[i]);
    doc.roundedRect(sx, y, scaleW, isActive?10:8, 1.5, 1.5, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(isActive?7.5:6.5);
    doc.setFont('helvetica', isActive?'bold':'normal');
    doc.text(label, sx+scaleW/2, y+(isActive?6.5:5.5), { align:'center' });
  });
  y += 16;

  // MODEL CONSENSUS
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(17,24,39);
  doc.text('Individual Model Predictions', PL, y+5);
  y += 8;
  const modelNames: Record<string,string> = {
    efficientnet_b3:'EfficientNet-B3', convnext_tiny:'ConvNeXt Tiny',
    resnet50:'ResNet-50', swin_tiny_patch4_window7_224:'Swin Transformer',
  };
  const models = Object.entries(opts.result.individual_predictions);
  const mw = (CW - (models.length-1)*3) / models.length;
  models.forEach(([key, data], i) => {
    const mx = PL + i*(mw+3);
    const msev = data.severity as number;
    const mRGB = sevColors[msev] ?? [37,99,235];
    const agrees = msev === sev;
    hex(249,250,251); doc.roundedRect(mx, y, mw, 20, 2, 2, 'F');
    doc.setDrawColor(...mRGB); doc.roundedRect(mx, y, mw, 20, 2, 2, 'S');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(17,24,39);
    doc.text(modelNames[key]??key, mx+mw/2, y+6, { align:'center' });
    hex(...mRGB); doc.roundedRect(mx+2, y+9, mw-4, 6, 1, 1, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(6.5); doc.setFont('helvetica','bold');
    doc.text(sevLabels[msev]??'', mx+mw/2, y+13, { align:'center' });
    doc.setFontSize(6); doc.setFont('helvetica','normal');
    doc.setTextColor(agrees ? 5 : 217, agrees ? 150 : 119, agrees ? 105 : 6);
    doc.text(agrees ? 'Agrees' : 'Differs', mx+mw/2, y+19, { align:'center' });
  });
  y += 26;

  // FUNDUS IMAGE
  if (opts.imageSrc) {
    try {
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(17,24,39);
      doc.text('Analyzed Fundus Image', PL, y+5);
      y += 8;
      doc.addImage(opts.imageSrc, 'JPEG', PL, y, 50, 50);
      const bx = PL + 55; const bw = CW - 55;
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(17,24,39);
      doc.text('Ensemble Confidence', bx, y+8);
      hex(243,244,246); doc.roundedRect(bx, y+11, bw, 6, 2, 2, 'F');
      hex(...sevRGB); doc.roundedRect(bx, y+11, bw*(opts.result.ensemble_prediction.confidence), 6, 2, 2, 'F');
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(...sevRGB);
      doc.text(`${(opts.result.ensemble_prediction.confidence*100).toFixed(1)}%`, bx+bw+2, y+16);
      y += 56;
    } catch { y += 4; }
  }

  // CLINICAL NOTES
  if (opts.clinicalNotes) {
    hex(255,251,235); doc.roundedRect(PL, y, CW, 18, 2, 2, 'F');
    doc.setDrawColor(253,230,138); doc.roundedRect(PL, y, CW, 18, 2, 2, 'S');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(161,98,7);
    doc.text('CLINICAL NOTES', PL+4, y+5);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(75,85,99);
    const lines = doc.splitTextToSize(opts.clinicalNotes, CW-10);
    doc.text(lines.slice(0,2), PL+4, y+11);
    y += 22;
  }

  // DISCLAIMER
  y = Math.max(y, 255);
  hex(254,242,242); doc.roundedRect(PL, y, CW, 12, 2, 2, 'F');
  doc.setFontSize(7); doc.setFont('helvetica','italic'); doc.setTextColor(153,27,27);
  doc.text('DISCLAIMER: This AI-generated report is intended as a clinical decision support tool only. It does not constitute a medical diagnosis and must be reviewed by a qualified ophthalmologist before clinical action is taken.', PL+4, y+5, { maxWidth: CW-8 });

  // FOOTER
  hex(15,23,42); doc.rect(0,282,W,15,'F');
  doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(156,163,175);
  doc.text('OpticNova · AI-Powered DR Detection · Academic Research Project', PL, 291);
  doc.text(`Ensemble QWK: 0.908 · Page 1 of 1`, W-PR, 291, { align:'right' });

  const fname = `OpticNova_${opts.patient.name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}

const api = {
  headers: (token: string) => ({ Authorization: `Bearer ${token}` }),
  async post(path: string, body: any, token?: string) {
    const res = await axios.post(`${API}${path}`, body, token ? { headers: this.headers(token) } : {});
    return res.data;
  },
  async get(path: string, token: string) {
    const res = await axios.get(`${API}${path}`, { headers: this.headers(token) });
    return res.data;
  },
  async del(path: string, token: string) {
    const res = await axios.delete(`${API}${path}`, { headers: this.headers(token) });
    return res.data;
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PredictionData     { severity: number; severity_text: string; confidence: number; }
interface IndividualPred     { severity: number; confidence: number; probabilities: number[]; }
interface PredictionResponse {
  success: boolean;
  individual_predictions: Record<string, IndividualPred>;
  ensemble_prediction: PredictionData;
  message: string;
}
interface Patient {
  id: string; name: string; age: number; gender: string;
  phone: string; diabetes_duration: string; notes: string;
  doctor_id: string; created_at: string;
  doctor_name?: string; doctor_hospital?: string;
}
interface Visit {
  id: string; patient_id: string; doctor_id: string; date: string;
  image_name: string; severity: number; severity_text: string;
  confidence: number; individual_results: Record<string, IndividualPred>;
  clinical_notes: string; patient_name?: string; doctor_name?: string;
}
interface Doctor {
  id: string; name: string; email: string;
  hospital: string; specialization: string; reg_no: string;
  created_at?: string; patient_count?: number; visit_count?: number; role?: string;
}

// ─── Severity ─────────────────────────────────────────────────────────────────
const SEV: Record<number,{ label:string; color:string; bg:string; border:string; badge:string; desc:string; urgency:string; followUp:string }> = {
  0:{ label:'No DR',         color:'#059669', bg:'#ecfdf5', border:'#a7f3d0', badge:'#d1fae5', desc:'No signs of diabetic retinopathy detected.',    urgency:'Routine - 12 months',   followUp:'Annual screening recommended.'                   },
  1:{ label:'Mild DR',       color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe', badge:'#dbeafe', desc:'Microaneurysms present. Monitor regularly.',      urgency:'Monitor - 6 months',    followUp:'Review in 6-12 months.'                          },
  2:{ label:'Moderate DR',   color:'#d97706', bg:'#fffbeb', border:'#fde68a', badge:'#fef3c7', desc:'More than mild NPDR. Referral recommended.',       urgency:'Refer - 1-3 months',    followUp:'Refer to retinal specialist within 1-3 months.'  },
  3:{ label:'Severe DR',     color:'#ea580c', bg:'#fff7ed', border:'#fed7aa', badge:'#ffedd5', desc:'Extensive NPDR. Prompt referral required.',        urgency:'Urgent - 2-4 weeks',    followUp:'Urgent referral within 2-4 weeks.'               },
  4:{ label:'Proliferative', color:'#dc2626', bg:'#fef2f2', border:'#fecaca', badge:'#fee2e2', desc:'PDR detected. Immediate ophthalmology needed.',    urgency:'Emergency - Immediate', followUp:'Immediate referral to vitreoretinal surgeon.'    },
};
const MODEL_NAMES: Record<string,string> = {
  efficientnet_b3:'EfficientNet-B3', convnext_tiny:'ConvNeXt Tiny',
  resnet50:'ResNet-50', swin_tiny_patch4_window7_224:'Swin Transformer',
};
const PERF = [
  { model:'EfficientNet-B3',   valQWK:0.8385, testQWK:0.8552, color:'#2563eb'              },
  { model:'ConvNeXt Tiny',     valQWK:0.8618, testQWK:0.9087, color:'#7c3aed'              },
  { model:'ResNet-50',         valQWK:0.8264, testQWK:0.8726, color:'#d97706'              },
  { model:'Swin Transformer',  valQWK:0.8543, testQWK:0.8953, color:'#059669'              },
  { model:'Balanced Ensemble', valQWK:null,   testQWK:0.9083, color:'#0ea5e9', isEnsemble:true },
];

// ─── Shared validation helpers ─────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => emailRegex.test(v.trim());
const isValidPhone = (v: string) => v.replace(/\D/g,'').length === 10;
const passwordRules = [
  { label: 'At least 8 characters',        test: (p:string) => p.length >= 8 },
  { label: 'One uppercase letter (A-Z)',    test: (p:string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a-z)',    test: (p:string) => /[a-z]/.test(p) },
  { label: 'One number (0-9)',              test: (p:string) => /[0-9]/.test(p) },
  { label: 'One special character (!@#$%)', test: (p:string) => /[!@#$%^&*()_+\-=\[\]{};:\'",.<>?]/.test(p) },
];
const isStrongPassword = (p: string) => passwordRules.every(r => r.test(p));

// ─── Tokens ───────────────────────────────────────────────────────────────────
const SB_W   = 260;
const ACCENT = '#2563eb';
const ADMIN_ACCENT = '#7c3aed';
const card: React.CSSProperties = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'24px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' };
const inp: React.CSSProperties  = { width:'100%', padding:'10px 13px', border:'1px solid #d1d5db', borderRadius:'8px', fontSize:'0.875rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' as const };
const lbl: React.CSSProperties  = { fontSize:'0.79rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'5px' };
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }); }

// ════════════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════════════
type Role = 'doctor'|'admin'|null;

export default function Root() {
  const [token,  setToken]  = useState<string|null>(()=>localStorage.getItem('on_token'));
  const [role,   setRole]   = useState<Role>(()=>localStorage.getItem('on_role') as Role);
  const [doctor, setDoctor] = useState<Doctor|null>(()=>{ const d=localStorage.getItem('on_doctor'); return d?JSON.parse(d):null; });
  const [authView, setAuthView] = useState<'login'|'signup'>('login');

  const handleLogin = (t:string,r:Role,d:Doctor|null)=>{
    setToken(t); setRole(r); setDoctor(d);
    localStorage.setItem('on_token',t);
    localStorage.setItem('on_role',r??'');
    if(d) localStorage.setItem('on_doctor',JSON.stringify(d));
  };
  const handleLogout = async ()=>{
    if(token){ try{ await api.post('/auth/logout',{},token); }catch{} }
    setToken(null); setRole(null); setDoctor(null);
    ['on_token','on_role','on_doctor'].forEach(k=>localStorage.removeItem(k));
  };

  if(!token||!role) return <AuthScreen view={authView} setView={setAuthView} onLogin={handleLogin}/>;
  if(role==='admin')  return <AdminPanel token={token} onLogout={handleLogout}/>;
  return <DoctorDashboard token={token} doctor={doctor} onLogout={handleLogout}/>;
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN  — FIX: full validation on login + signup, phone field added
// ════════════════════════════════════════════════════════════════════════════
function AuthScreen({ view, setView, onLogin }:{ view:'login'|'signup'; setView:(v:'login'|'signup')=>void; onLogin:(t:string,r:Role,d:Doctor|null)=>void }) {
  const [f,setF]=useState({name:'',email:'',password:'',confirm:'',hospital:'',specialization:'',regNo:'',phone:''});
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const set=(k:string,v:string)=>setF(p=>({...p,[k]:v}));

  // FIX 1 & 2: email format + password length checked before API call
  const handleLogin=async()=>{
    setErr('');
    if(!isValidEmail(f.email)){ setErr('Please enter a valid email address (e.g. doctor@hospital.com)'); return; }
    if(f.password.length<1){ setErr('Please enter your password'); return; }
    setBusy(true);
    try{ const r=await api.post('/auth/login',{email:f.email,password:f.password}); onLogin(r.token,r.role,r.doctor); }
    catch(e:any){ setErr(e.response?.data?.detail||'Login failed'); }
    finally{ setBusy(false); }
  };

  // FIX 3, 4, 5: all fields validated before setBusy; phone field added
  const handleSignup=async()=>{
    setErr('');
    if(f.name.trim().length<2){ setErr('Please enter your full name'); return; }
    if(!isValidEmail(f.email)){ setErr('Please enter a valid email address (e.g. doctor@hospital.com)'); return; }
    if(!isStrongPassword(f.password)){ setErr('Password does not meet the requirements shown below'); return; }
    if(f.password!==f.confirm){ setErr('Passwords do not match'); return; }
    if(!isValidPhone(f.phone)){ setErr('Phone number must be exactly 10 digits'); return; }
    if(f.hospital.trim().length<2){ setErr('Please enter your hospital or clinic name'); return; }
    if(f.specialization.trim().length<2){ setErr('Please enter your specialization'); return; }
    if(f.regNo.trim().length<3){ setErr('Please enter a valid medical registration number'); return; }
    setBusy(true);
    try{ const r=await api.post('/auth/signup',{name:f.name,email:f.email,password:f.password,hospital:f.hospital,specialization:f.specialization,reg_no:f.regNo}); onLogin(r.token,r.role,r.doctor); }
    catch(e:any){ setErr(e.response?.data?.detail||'Signup failed'); }
    finally{ setBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a 0%,#1d4ed8 60%,#0ea5e9 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", padding:'20px' }}>
      <div style={{ background:'#fff', borderRadius:'20px', padding:'40px', width:'100%', maxWidth:'460px', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ width:'58px', height:'58px', borderRadius:'15px', background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="6" fill="white" opacity="0.25"/><circle cx="14" cy="14" r="2.5" fill="white"/>
              <line x1="14" y1="2" x2="14" y2="8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="14" y1="20" x2="14" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="2" y1="14" x2="8" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="20" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827' }}>Optic<span style={{ color:ACCENT }}>Nova</span></div>
          <div style={{ fontSize:'0.82rem', color:'#6b7280', marginTop:'3px' }}>AI-Powered DR Detection · Clinical Portal</div>
        </div>
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'10px', padding:'4px', marginBottom:'24px' }}>
          {(['login','signup'] as const).map(t=>(
            <button key={t} onClick={()=>{setView(t);setErr('');setF({name:'',email:'',password:'',confirm:'',hospital:'',specialization:'',regNo:'',phone:''}); }} style={{ flex:1, padding:'9px', border:'none', borderRadius:'7px', background:view===t?'#fff':'transparent', color:view===t?'#111827':'#6b7280', fontWeight:view===t?700:500, fontSize:'0.88rem', cursor:'pointer', fontFamily:'inherit', boxShadow:view===t?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all 0.15s' }}>
              {t==='login'?'Sign In':'Create Account'}
            </button>
          ))}
        </div>
        {view==='login'?(
          <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
            <div><label style={lbl}>Email</label><input style={inp} type="email" placeholder="doctor@hospital.com" value={f.email} onChange={e=>set('email',e.target.value)}/></div>
            <div><label style={lbl}>Password</label><input style={inp} type="password" placeholder="Min 6 characters" value={f.password} onChange={e=>set('password',e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()}/></div>
            {err&&<div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.85rem' }}>⚠ {err}</div>}
            <button onClick={handleLogin} disabled={busy} style={{ padding:'13px', background:busy?'#93c5fd':ACCENT, border:'none', borderRadius:'9px', color:'#fff', fontWeight:700, fontSize:'0.95rem', cursor:busy?'not-allowed':'pointer', fontFamily:'inherit' }}>{busy?'Signing in...':'Sign In'}</button>
          </div>
        ):(
          <div style={{ display:'flex', flexDirection:'column', gap:'13px' }}>
            {/* Required field legend */}
            <p style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:'-4px' }}><span style={{ color:'#dc2626' }}>*</span> Required fields</p>
            <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Full Name</label><input style={inp} placeholder="Dr. Jane Smith" value={f.name} onChange={e=>set('name',e.target.value)}/></div>
            <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Email Address</label><input style={inp} type="email" placeholder="doctor@hospital.com" value={f.email} onChange={e=>set('email',e.target.value)}/></div>
            <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Phone Number (10 digits)</label><input style={inp} type="tel" placeholder="9876543210" value={f.phone} onChange={e=>set('phone', e.target.value.replace(/\D/g,'').slice(0,10))} maxLength={10}/></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div>
                <label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Password</label>
                <input style={inp} type="password" placeholder="Create password" value={f.password} onChange={e=>set('password',e.target.value)}/>
                {/* Live password requirements checklist */}
                {f.password.length>0&&(
                  <div style={{ marginTop:'8px', padding:'10px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px' }}>
                    {passwordRules.map(r=>{
                      const ok=r.test(f.password);
                      return <div key={r.label} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'0.72rem', color:ok?'#059669':'#9ca3af', marginBottom:'3px' }}>
                        <span style={{ fontSize:'0.8rem' }}>{ok?'✓':'○'}</span>{r.label}
                      </div>;
                    })}
                  </div>
                )}
              </div>
              <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Confirm Password</label><input style={inp} type="password" placeholder="Repeat password" value={f.confirm} onChange={e=>set('confirm',e.target.value)}/></div>
            </div>
            <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Hospital / Clinic</label><input style={inp} placeholder="City Eye Hospital" value={f.hospital} onChange={e=>set('hospital',e.target.value)}/></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Specialization</label><input style={inp} placeholder="Ophthalmology" value={f.specialization} onChange={e=>set('specialization',e.target.value)}/></div>
              <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Medical Reg. No.</label><input style={inp} placeholder="MCI-12345" value={f.regNo} onChange={e=>set('regNo',e.target.value)}/></div>
            </div>
            {err&&<div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.85rem' }}>⚠ {err}</div>}
            <button onClick={handleSignup} disabled={busy} style={{ padding:'13px', background:busy?'#93c5fd':ACCENT, border:'none', borderRadius:'9px', color:'#fff', fontWeight:700, fontSize:'0.95rem', cursor:busy?'not-allowed':'pointer', fontFamily:'inherit' }}>{busy?'Creating account...':'Create Account'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════════════════════════════════════
type AdminPage = 'overview'|'doctors'|'patients'|'insights';

function AdminPanel({ token, onLogout }:{ token:string; onLogout:()=>void }) {
  const [page, setPage] = useState<AdminPage>('overview');
  const [stats, setStats] = useState<any>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [severityDist, setSeverityDist] = useState<any[]>([]);
  const [bars, setBars] = useState(false);
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [dForm, setDForm] = useState({ name:'', email:'', password:'', hospital:'Optic Nova', specialization:'', regNo:'' });
  const [dErr, setDErr] = useState('');
  const [dBusy, setDBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);
  const [deleteErr, setDeleteErr] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [s, d, p, ra, sd] = await Promise.all([
        api.get('/admin/stats', token),
        api.get('/admin/doctors', token),
        api.get('/patients', token),
        api.get('/admin/recent-activity', token),
        api.get('/admin/severity-distribution', token),
      ]);
      setStats(s); setDoctors(d); setPatients(p); setRecentActivity(ra); setSeverityDist(sd);
    } catch(e) { console.error(e); }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { setBars(false); const t=setTimeout(()=>setBars(true),400); return()=>clearTimeout(t); }, [page]);

  // FIX 9, 10, 11: Admin add doctor validation
  const addDoctor = async () => {
    setDErr('');
    if(dForm.name.trim().length<2){ setDErr('Please enter the doctor\'s full name'); return; }
    if(!isValidEmail(dForm.email)){ setDErr('Please enter a valid email address'); return; }
    if(!isStrongPassword(dForm.password)){ setDErr('Password must be 8+ chars with uppercase, lowercase, number and special character'); return; }
    if(dForm.specialization.trim().length<2){ setDErr('Please enter a specialization'); return; }
    if(dForm.regNo.trim().length<3){ setDErr('Please enter a valid registration number'); return; }
    setDBusy(true);
    try {
      await api.post('/admin/doctors', { name:dForm.name, email:dForm.email, password:dForm.password, hospital:dForm.hospital, specialization:dForm.specialization, reg_no:dForm.regNo }, token);
      setDForm({ name:'', email:'', password:'', hospital:'Optic Nova', specialization:'', regNo:'' });
      setShowAddDoctor(false);
      await loadAll();
    } catch(e:any) { setDErr(e.response?.data?.detail||'Failed to add doctor'); }
    finally { setDBusy(false); }
  };

  const deleteDoctor = async (id: string) => {
    setDeleteErr('');
    try { await api.del(`/admin/doctors/${id}`, token); setConfirmDelete(null); await loadAll(); }
    catch(e:any) { setDeleteErr(e.response?.data?.detail||'Failed to remove doctor'); }
  };

  const NavItem = ({ id, label, icon }:{ id:AdminPage; label:string; icon:React.ReactNode }) => {
    const active = page===id;
    return (
      <button onClick={()=>setPage(id)} style={{ display:'flex', alignItems:'center', gap:'12px', width:'100%', padding:'11px 16px', border:'none', borderRadius:'8px', background:active?'rgba(124,58,237,0.2)':'transparent', color:active?'#c4b5fd':'#9ca3af', fontWeight:active?700:400, fontSize:'0.95rem', cursor:'pointer', textAlign:'left' as const, fontFamily:'inherit', transition:'all 0.15s' }}
        onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';}}
        onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLElement).style.background='transparent';}}>
        <span style={{ opacity:active?1:0.6 }}>{icon}</span>{label}
      </button>
    );
  };

  const totalVisits = stats?.visits ?? 0;

  return (
    <div style={{ fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", display:'flex', minHeight:'100vh', background:'#f3f4f6' }}>
      <aside style={{ position:'fixed', top:0, left:0, bottom:0, width:SB_W, background:'#1e1b4b', display:'flex', flexDirection:'column', zIndex:100 }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'linear-gradient(135deg,#7c3aed,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="6" fill="white" opacity="0.25"/><circle cx="14" cy="14" r="2.5" fill="white"/>
                <line x1="14" y1="2" x2="14" y2="8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="20" x2="14" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="14" x2="8" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="20" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:'1rem', color:'#f9fafb' }}>Optic<span style={{ color:'#a78bfa' }}>Nova</span></div>
              <div style={{ fontSize:'0.7rem', color:'#6b7280', marginTop:'1px' }}>Admin Panel</div>
            </div>
          </div>
        </div>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(124,58,237,0.15)' }}>
          <div style={{ fontSize:'0.68rem', color:'#7c3aed', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.1em', marginBottom:'4px' }}>Administrator</div>
          <div style={{ fontSize:'0.88rem', color:'#e5e7eb', fontWeight:600 }}>System Admin</div>
          <div style={{ fontSize:'0.72rem', color:'#6b7280', marginTop:'1px' }}>Full system access</div>
        </div>
        <nav style={{ padding:'16px 12px', flex:1 }}>
          <div style={{ fontSize:'0.68rem', color:'#4b5563', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, padding:'0 4px', marginBottom:'8px' }}>Admin Menu</div>
          <NavItem id="overview" label="Overview"       icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}/>
          <NavItem id="doctors"  label="Manage Doctors" icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}/>
          <NavItem id="patients" label="All Patients"   icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}/>
          <NavItem id="insights" label="DR Insights"    icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}/>
        </nav>
        <div style={{ padding:'16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onLogout} style={{ width:'100%', padding:'9px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#9ca3af', fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit' }}>Sign Out</button>
        </div>
      </aside>

      <div style={{ marginLeft:SB_W, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
        <header style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'0 32px', height:'56px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'0.72rem', fontWeight:700, background:'#ede9fe', color:'#7c3aed', padding:'3px 10px', borderRadius:'100px', textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>Admin</span>
            <span style={{ fontSize:'0.95rem', color:'#374151', fontWeight:600 }}>
              {page==='overview'?'System Overview':page==='doctors'?'Manage Doctors':page==='patients'?'All Patients':'DR Insights'}
            </span>
          </div>
          <div style={{ fontSize:'0.88rem', color:'#6b7280' }}>OpticNova · <strong style={{ color:'#7c3aed' }}>Admin Panel</strong></div>
        </header>

        <main style={{ flex:1, padding:'28px 32px', overflowY:'auto' }}>

          {page==='overview' && (
            <>
              <div style={{ background:'linear-gradient(135deg,#1e1b4b 0%,#7c3aed 60%,#a855f7 100%)', borderRadius:'14px', padding:'32px 36px', marginBottom:'24px', display:'flex', alignItems:'center', gap:'24px' }}>
                <div style={{ width:'56px', height:'56px', borderRadius:'14px', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'1.8rem' }}>&#9889;</div>
                <div>
                  <h1 style={{ fontSize:'1.7rem', fontWeight:800, color:'#fff', letterSpacing:'-0.03em', marginBottom:'8px' }}>Admin Overview</h1>
                  <p style={{ fontSize:'1rem', color:'rgba(255,255,255,0.82)', lineHeight:1.7 }}>Full visibility into the OpticNova system - doctors, patients, screenings, and population-level DR insights.</p>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
                {[
                  { val:String(stats?.doctors??0), label:'Registered Doctors', icon:'👨‍⚕️', color:ADMIN_ACCENT },
                  { val:String(stats?.patients??0), label:'Total Patients',    icon:'👥', color:'#059669' },
                  { val:String(stats?.visits??0),   label:'Total Screenings',  icon:'🔬', color:'#2563eb' },
                  { val:totalVisits>0?`${((severityDist.filter(s=>s.severity>=2).reduce((a:number,s:any)=>a+s.count,0)/totalVisits)*100).toFixed(0)}%`:'—', label:'Patients Needing Referral', icon:'⚠️', color:'#d97706' },
                ].map(s=>(
                  <div key={s.label} style={{ ...card, display:'flex', flexDirection:'column', gap:'12px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>{s.icon}</div>
                    <div style={{ fontSize:'1.9rem', fontWeight:800, color:'#111827', letterSpacing:'-0.03em', lineHeight:1 }}>{s.val}</div>
                    <div style={{ fontSize:'0.88rem', color:'#6b7280', fontWeight:500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'16px' }}>Recent Screenings Across All Doctors</h3>
                {recentActivity.length===0 ? (
                  <p style={{ color:'#9ca3af', fontSize:'0.875rem' }}>No screenings yet.</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    {recentActivity.map((a,i)=>{
                      const s = SEV[a.severity]??SEV[0];
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#f9fafb', borderRadius:'8px', border:'1px solid #f3f4f6' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                            <div>
                              <span style={{ fontSize:'0.875rem', fontWeight:600, color:'#111827' }}>{a.patient_name}</span>
                              <span style={{ fontSize:'0.8rem', color:'#6b7280', marginLeft:'8px' }}>by Dr. {a.doctor_name} · {a.hospital}</span>
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                            <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'3px 9px', borderRadius:'100px', background:s.badge, color:s.color }}>{s.label}</span>
                            <span style={{ fontSize:'0.75rem', color:'#9ca3af' }}>{fmtDate(a.date)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {page==='doctors' && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px' }}>
                <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827' }}>Manage Doctors</h2>
                <button onClick={()=>setShowAddDoctor(true)} style={{ padding:'10px 20px', background:ADMIN_ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'8px' }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Doctor
                </button>
              </div>

              {showAddDoctor && (
                <div style={{ ...card, marginBottom:'20px', border:'2px solid #ede9fe', background:'#faf5ff' }}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Onboard New Doctor</h3>
                  <p style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:'14px' }}><span style={{ color:'#dc2626' }}>*</span> Required fields</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Full Name</label><input style={inp} placeholder="Dr. Aryan Mercer" value={dForm.name} onChange={e=>setDForm(p=>({...p,name:e.target.value}))}/></div>
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Email</label><input style={inp} type="email" placeholder="doctor@opticnova.com" value={dForm.email} onChange={e=>setDForm(p=>({...p,email:e.target.value}))}/></div>
                    <div>
                      <label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Temporary Password</label>
                      <input style={inp} type="password" placeholder="Create password" value={dForm.password} onChange={e=>setDForm(p=>({...p,password:e.target.value}))}/>
                      {dForm.password.length>0&&(
                        <div style={{ marginTop:'6px', padding:'8px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'7px' }}>
                          {passwordRules.map(r=>{
                            const ok=r.test(dForm.password);
                            return <div key={r.label} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'0.68rem', color:ok?'#059669':'#9ca3af', marginBottom:'2px' }}>
                              <span>{ok?'✓':'○'}</span>{r.label}
                            </div>;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'16px' }}>
                    <div>
                      <label style={lbl}>Hospital</label>
                      <input style={{ ...inp, background:'#f3f4f6', color:'#6b7280', cursor:'not-allowed' }} value="Optic Nova" readOnly/>
                    </div>
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Specialization</label><input style={inp} placeholder="Ophthalmology" value={dForm.specialization} onChange={e=>setDForm(p=>({...p,specialization:e.target.value}))}/></div>
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Reg. No.</label><input style={inp} placeholder="MCI-12345" value={dForm.regNo} onChange={e=>setDForm(p=>({...p,regNo:e.target.value}))}/></div>
                  </div>
                  {dErr && <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.85rem', marginBottom:'12px' }}>⚠ {dErr}</div>}
                  <div style={{ display:'flex', gap:'10px' }}>
                    <button onClick={addDoctor} disabled={dBusy} style={{ padding:'10px 24px', background:ADMIN_ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{dBusy?'Adding...':'Add Doctor'}</button>
                    <button onClick={()=>{setShowAddDoctor(false);setDErr('');}} style={{ padding:'10px 20px', background:'#fff', border:'1px solid #d1d5db', borderRadius:'8px', color:'#374151', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  </div>
                </div>
              )}

              {confirmDelete && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
                  <div style={{ background:'#fff', borderRadius:'14px', padding:'32px', maxWidth:'400px', width:'90%', textAlign:'center' }}>
                    <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>⚠️</div>
                    <h3 style={{ fontWeight:800, color:'#111827', marginBottom:'8px' }}>Remove Doctor?</h3>
                    <p style={{ fontSize:'0.875rem', color:'#6b7280', marginBottom:'24px', lineHeight:1.6 }}>This will remove the doctor's account. Their patient records and visits will be retained for audit purposes.</p>
                    {deleteErr&&<div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.85rem', marginBottom:'16px' }}>⚠ {deleteErr}</div>}
                    <div style={{ display:'flex', gap:'12px', justifyContent:'center' }}>
                      <button onClick={()=>deleteDoctor(confirmDelete)} style={{ padding:'10px 24px', background:'#dc2626', border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Yes, Remove</button>
                      <button onClick={()=>{setConfirmDelete(null);setDeleteErr('');}} style={{ padding:'10px 20px', background:'#f3f4f6', border:'none', borderRadius:'8px', color:'#374151', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {doctors.length===0 ? (
                  <div style={{ ...card, textAlign:'center', padding:'48px', color:'#9ca3af' }}><p>No doctors registered yet.</p></div>
                ) : doctors.map(d=>(
                  <div key={d.id} style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:'12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                      <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:`${ADMIN_ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>👨‍⚕️</div>
                      <div>
                        <p style={{ fontWeight:700, color:'#111827', fontSize:'0.95rem', marginBottom:'3px' }}>{d.name}</p>
                        <p style={{ fontSize:'0.78rem', color:'#6b7280' }}>{d.email} · {d.hospital}</p>
                        <p style={{ fontSize:'0.75rem', color:'#9ca3af', marginTop:'1px' }}>{d.specialization} · Reg: {d.reg_no}</p>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:'1.2rem', fontWeight:800, color:ADMIN_ACCENT }}>{d.patient_count??0}</div><div style={{ fontSize:'0.7rem', color:'#9ca3af' }}>Patients</div></div>
                      <div style={{ textAlign:'center' }}><div style={{ fontSize:'1.2rem', fontWeight:800, color:'#2563eb' }}>{d.visit_count??0}</div><div style={{ fontSize:'0.7rem', color:'#9ca3af' }}>Screenings</div></div>
                      <div style={{ fontSize:'0.75rem', color:'#9ca3af' }}>Joined {fmtDate(d.created_at??'')}</div>
                      <button onClick={()=>setConfirmDelete(d.id)} style={{ padding:'7px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'7px', color:'#dc2626', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {page==='patients' && (
            <>
              <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827', marginBottom:'24px' }}>All Patients</h2>
              {patients.length===0 ? (
                <div style={{ ...card, textAlign:'center', padding:'48px', color:'#9ca3af' }}><p>No patients registered yet.</p></div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {patients.map(p=>{
                    const pv = p as any;
                    return (
                      <div key={p.id} style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:'12px', padding:'16px 20px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                          <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:`${ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>👤</div>
                          <div>
                            <p style={{ fontWeight:700, color:'#111827', fontSize:'0.9rem', marginBottom:'2px' }}>{p.name}</p>
                            <p style={{ fontSize:'0.75rem', color:'#6b7280' }}>{p.age}y · {p.gender} · {p.phone}</p>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'20px', fontSize:'0.8rem', color:'#6b7280' }}>
                          {p.diabetes_duration && <span>{p.diabetes_duration}</span>}
                          <div style={{ textAlign:'center' }}><div style={{ fontSize:'0.7rem', color:'#9ca3af' }}>Doctor</div><div style={{ fontWeight:600, color:'#374151', fontSize:'0.82rem' }}>{pv.doctor_name||'—'}</div></div>
                          <div style={{ textAlign:'center' }}><div style={{ fontSize:'0.7rem', color:'#9ca3af' }}>Hospital</div><div style={{ fontWeight:600, color:'#374151', fontSize:'0.82rem' }}>{pv.doctor_hospital||'—'}</div></div>
                          <div style={{ fontSize:'0.75rem', color:'#9ca3af' }}>Added {fmtDate(p.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {page==='insights' && (
            <>
              <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827', marginBottom:'8px' }}>DR Population Insights</h2>
              <p style={{ fontSize:'0.9rem', color:'#6b7280', marginBottom:'24px' }}>System-wide analysis of DR severity distribution across all screenings.</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'20px' }}>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Severity Distribution</h3>
                  <p style={{ fontSize:'0.8rem', color:'#9ca3af', marginBottom:'24px' }}>Total screenings: <strong>{totalVisits}</strong></p>
                  {totalVisits===0 ? <p style={{ color:'#9ca3af', fontSize:'0.875rem' }}>No screening data yet.</p> : (
                    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                      {Object.entries(SEV).map(([key,s])=>{
                        const sd = severityDist.find((x:any)=>x.severity===Number(key));
                        const count = sd?.count??0;
                        const pct = totalVisits>0 ? (count/totalVisits)*100 : 0;
                        return (
                          <div key={key}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                              <span style={{ fontSize:'0.875rem', fontWeight:600, color:s.color }}>{s.label}</span>
                              <span style={{ fontSize:'0.875rem', fontWeight:700, color:'#374151' }}>{count} <span style={{ color:'#9ca3af', fontWeight:400 }}>({pct.toFixed(1)}%)</span></span>
                            </div>
                            <div style={{ height:'10px', background:'#f3f4f6', borderRadius:'6px', overflow:'hidden' }}>
                              <div style={{ height:'100%', width:bars?`${pct}%`:'0%', background:s.color, borderRadius:'6px', transition:'width 1.2s ease' }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Clinical Urgency Breakdown</h3>
                  <p style={{ fontSize:'0.8rem', color:'#9ca3af', marginBottom:'24px' }}>Actionable population summary for resource planning</p>
                  {totalVisits===0 ? <p style={{ color:'#9ca3af', fontSize:'0.875rem' }}>No data yet.</p> : (() => {
                    const noRef  = severityDist.filter((s:any)=>s.severity<=1).reduce((a:number,s:any)=>a+s.count,0);
                    const refer  = severityDist.filter((s:any)=>s.severity===2).reduce((a:number,s:any)=>a+s.count,0);
                    const urgent = severityDist.filter((s:any)=>s.severity===3).reduce((a:number,s:any)=>a+s.count,0);
                    const emerg  = severityDist.filter((s:any)=>s.severity===4).reduce((a:number,s:any)=>a+s.count,0);
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                        {[
                          { label:'Routine Monitoring', count:noRef,  color:'#059669', bg:'#ecfdf5', desc:'No referral needed' },
                          { label:'Refer (1-3 months)', count:refer,  color:'#d97706', bg:'#fffbeb', desc:'Retinal specialist' },
                          { label:'Urgent (2-4 weeks)', count:urgent, color:'#ea580c', bg:'#fff7ed', desc:'Prompt referral' },
                          { label:'Emergency',          count:emerg,  color:'#dc2626', bg:'#fef2f2', desc:'Immediate action' },
                        ].map(r=>(
                          <div key={r.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:r.bg, borderRadius:'10px', border:`1px solid ${r.color}22` }}>
                            <div><p style={{ fontWeight:700, color:r.color, fontSize:'0.875rem' }}>{r.label}</p><p style={{ fontSize:'0.75rem', color:'#6b7280' }}>{r.desc}</p></div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontSize:'1.6rem', fontWeight:800, color:r.color, lineHeight:1 }}>{r.count}</div>
                              <div style={{ fontSize:'0.72rem', color:'#9ca3af' }}>{((r.count/totalVisits)*100).toFixed(1)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div style={{ ...card, borderLeft:`4px solid ${ADMIN_ACCENT}`, background:'#faf5ff' }}>
                <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'8px' }}>What This Means</h3>
                <p style={{ fontSize:'0.875rem', color:'#4b5563', lineHeight:1.8 }}>This population-level view is what makes OpticNova genuinely useful for hospital management. A high proportion of Moderate/Severe DR cases in a region may indicate inadequate diabetic control in the population, signalling a need for more aggressive screening programs or endocrinology referrals alongside ophthalmology.</p>
              </div>
            </>
          )}
        </main>

        <footer style={{ background:'#fff', borderTop:'1px solid #e5e7eb', padding:'14px 32px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.82rem', color:'#6b7280', fontWeight:600 }}>OpticNova · Admin Panel</span>
          <span style={{ fontSize:'0.78rem', color:'#9ca3af' }}>Academic Research Project · Ensemble QWK 0.908</span>
        </footer>
      </div>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } @keyframes spin{to{transform:rotate(360deg)}} @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DOCTOR DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
type Page = 'home'|'analyze'|'patients'|'patient_detail'|'about';

function DoctorDashboard({ token, doctor, onLogout }:{ token:string; doctor:Doctor|null; onLogout:()=>void }) {
  const [page, setPage]   = useState<Page>('home');
  const [bars, setBars]   = useState(false);
  const [patients, setPatients]   = useState<Patient[]>([]);
  const [visits,   setVisits]     = useState<Visit[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient|null>(null);
  const [patientVisits,   setPatientVisits]   = useState<Visit[]>([]);

  const [file, setFile]       = useState<File|null>(null);
  const [preview, setPreview] = useState<string|null>(null);
  const [result, setResult]   = useState<PredictionResponse|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string|null>(null);
  const [drag, setDrag]       = useState(false);
  const [clinicalNotes, setClinicalNotes]     = useState('');
  const [analyzePatientId, setAnalyzePatientId] = useState('');
  const [savedVisitId, setSavedVisitId]       = useState<string|null>(null);
  const [savingVisit, setSavingVisit]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAddPatient, setShowAddPatient] = useState(false);
  const [patientSearch,  setPatientSearch]  = useState('');
  const [pForm, setPForm] = useState({ name:'', age:'', gender:'Male', phone:'', diabetesDuration:'', notes:'' });
  const [pErr, setPErr] = useState('');  // FIX: dedicated error state for patient form
  const [addingPatient, setAddingPatient] = useState(false);

  const loadPatients = useCallback(async () => {
    try {
      const q = patientSearch ? `?search=${encodeURIComponent(patientSearch)}` : '';
      setPatients(await api.get(`/patients${q}`, token));
    } catch {}
  }, [token, patientSearch]);

  const loadVisits = useCallback(async () => {
    try { setVisits(await api.get('/visits', token)); } catch {}
  }, [token]);

  useEffect(() => { loadPatients(); loadVisits(); }, [loadPatients, loadVisits]);
  useEffect(() => { setBars(false); window.scrollTo(0,0); const t=setTimeout(()=>setBars(true),400); return()=>clearTimeout(t); }, [page]);
  useEffect(() => { const t=setTimeout(()=>loadPatients(),300); return()=>clearTimeout(t); }, [patientSearch]);

  const handleFile=(f:File)=>{ setFile(f); setResult(null); setError(null); setSavedVisitId(null); const r=new FileReader(); r.onload=e=>setPreview(e.target?.result as string); r.readAsDataURL(f); };

  const predict=async()=>{
    if(!file) return; setLoading(true); setError(null); setResult(null); setSavedVisitId(null);
    const fd=new FormData(); fd.append('file',file);
    try{ const res=await axios.post<PredictionResponse>(`${API}/predict-all`,fd,{headers:{'Content-Type':'multipart/form-data'}}); setResult(res.data); }
    catch(e:any){ setError(e.response?.data?.detail||'Analysis failed. Is the backend running?'); }
    finally{ setLoading(false); }
  };

  const saveVisit=async()=>{
    if(!result||!analyzePatientId) return; setSavingVisit(true);
    try{
      const res=await api.post('/visits',{ patient_id:analyzePatientId, image_name:file?.name??'image', severity:result.ensemble_prediction.severity, severity_text:result.ensemble_prediction.severity_text, confidence:result.ensemble_prediction.confidence, individual_results:result.individual_predictions, clinical_notes:clinicalNotes }, token);
      setSavedVisitId(res.id); await loadVisits();
    } catch(e:any){ setError(e.response?.data?.detail||'Failed to save visit'); }
    finally{ setSavingVisit(false); }
  };

  // FIX 6, 7, 8: Full patient form validation before API call
  const addPatient=async()=>{
    setPErr('');
    if(pForm.name.trim().length<2){ setPErr('Please enter the patient\'s full name'); return; }
    const ageNum = Number(pForm.age);
    if(!pForm.age || isNaN(ageNum) || ageNum < 1 || ageNum > 120){ setPErr('Please enter a valid age between 1 and 120'); return; }
    if(!isValidPhone(pForm.phone)){ setPErr('Phone number must be exactly 10 digits'); return; }
    setAddingPatient(true);
    try{
      await api.post('/patients',{name:pForm.name,age:ageNum,gender:pForm.gender,phone:pForm.phone,diabetes_duration:pForm.diabetesDuration,notes:pForm.notes},token);
      setPForm({name:'',age:'',gender:'Male',phone:'',diabetesDuration:'',notes:''}); setShowAddPatient(false); await loadPatients();
    } catch(e:any){ setPErr(e.response?.data?.detail||'Failed to register patient'); }
    finally{ setAddingPatient(false); }
  };

  const openPatient=async(p:Patient)=>{ setSelectedPatient(p); try{ setPatientVisits(await api.get(`/patients/${p.id}/visits`,token)); }catch{ setPatientVisits([]); } setPage('patient_detail'); };
  const reset=()=>{ setFile(null); setPreview(null); setResult(null); setError(null); setClinicalNotes(''); setSavedVisitId(null); };
  const sev = result?(SEV[result.ensemble_prediction.severity]??SEV[0]):null;

  const NavItem=({ id, label, icon, badge }:{ id:Page; label:string; icon:React.ReactNode; badge?:number })=>{
    const active=page===id;
    return (
      <button onClick={()=>setPage(id)} style={{ display:'flex', alignItems:'center', gap:'12px', width:'100%', padding:'11px 16px', border:'none', borderRadius:'8px', background:active?'rgba(37,99,235,0.18)':'transparent', color:active?'#93c5fd':'#9ca3af', fontWeight:active?700:400, fontSize:'0.95rem', cursor:'pointer', textAlign:'left' as const, fontFamily:'inherit', transition:'all 0.15s' }}
        onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';}}
        onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLElement).style.background='transparent';}}>
        <span style={{ opacity:active?1:0.6 }}>{icon}</span>{label}
        {badge!==undefined&&badge>0&&<span style={{ marginLeft:'auto', background:ACCENT, color:'#fff', fontSize:'0.65rem', fontWeight:700, borderRadius:'100px', padding:'2px 7px' }}>{badge}</span>}
      </button>
    );
  };

  const StatCard=({ val, label, icon, color }:{ val:string; label:string; icon:string; color:string })=>(
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:'12px' }}>
      <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>{icon}</div>
      <div style={{ fontSize:'1.9rem', fontWeight:800, color:'#111827', letterSpacing:'-0.03em', lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:'0.88rem', color:'#6b7280', fontWeight:500 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", display:'flex', minHeight:'100vh', background:'#f3f4f6' }}>
      <aside style={{ position:'fixed', top:0, left:0, bottom:0, width:SB_W, background:'#111827', display:'flex', flexDirection:'column', zIndex:100 }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="6" fill="white" opacity="0.25"/><circle cx="14" cy="14" r="2.5" fill="white"/>
                <line x1="14" y1="2" x2="14" y2="8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="20" x2="14" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="14" x2="8" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="20" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:'1rem', color:'#f9fafb' }}>Optic<span style={{ color:'#60a5fa' }}>Nova</span></div>
              <div style={{ fontSize:'0.7rem', color:'#6b7280', marginTop:'1px' }}>DR Detection System</div>
            </div>
          </div>
        </div>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize:'0.68rem', color:'#4b5563', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:'5px' }}>Signed in as</div>
          <div style={{ fontSize:'0.88rem', color:'#e5e7eb', fontWeight:600 }}>{doctor?.name}</div>
          <div style={{ fontSize:'0.73rem', color:'#6b7280', marginTop:'2px' }}>{doctor?.hospital}</div>
        </div>
        <nav style={{ padding:'16px 12px', flex:1 }}>
          <div style={{ fontSize:'0.68rem', color:'#4b5563', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, padding:'0 4px', marginBottom:'8px' }}>Menu</div>
          <NavItem id="home"     label="Home"          icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}/>
          <NavItem id="analyze"  label="Analyze Image" icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>}/>
          <NavItem id="patients" label="Patients"      icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>} badge={patients.length}/>
          <NavItem id="about"    label="Performance"   icon={<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}/>
        </nav>
        <div style={{ padding:'16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ background:'rgba(37,99,235,0.12)', border:'1px solid rgba(37,99,235,0.25)', borderRadius:'10px', padding:'14px 16px', marginBottom:'12px' }}>
            <div style={{ fontSize:'0.68rem', color:'#6b7280', fontWeight:600, marginBottom:'4px', textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>Ensemble QWK</div>
            <div style={{ fontSize:'1.6rem', fontWeight:900, color:'#60a5fa', lineHeight:1 }}>0.908</div>
            <div style={{ fontSize:'0.7rem', color:'#10b981', marginTop:'4px', fontWeight:700 }}>Excellent Range</div>
          </div>
          <button onClick={onLogout} style={{ width:'100%', padding:'9px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#9ca3af', fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit' }}>Sign Out</button>
        </div>
      </aside>

      <div style={{ marginLeft:SB_W, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
        <header style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'0 32px', height:'56px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
          <span style={{ fontSize:'0.95rem', color:'#374151', fontWeight:600 }}>
            {page==='home'?'Home':page==='analyze'?'Analyze Image':page==='patients'?'Patient Records':page==='patient_detail'?`Patient: ${selectedPatient?.name??''}`:' Performance & About'}
          </span>
          <div style={{ fontSize:'0.88rem', color:'#6b7280' }}>OpticNova · <strong style={{ color:'#374151' }}>Clinical Portal</strong></div>
        </header>

        <main style={{ flex:1, padding:'28px 32px', overflowY:'auto' }}>

          {page==='home'&&(
            <>
              <div style={{ background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#0ea5e9 100%)', borderRadius:'14px', padding:'32px 36px', marginBottom:'24px', display:'flex', alignItems:'center', gap:'24px' }}>
                <div style={{ width:'56px', height:'56px', borderRadius:'14px', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'1.8rem' }}>🔬</div>
                <div>
                  <h1 style={{ fontSize:'1.7rem', fontWeight:800, color:'#fff', letterSpacing:'-0.03em', marginBottom:'8px' }}>Welcome, Dr. {doctor?.name.split(' ')[0]}!</h1>
                  <p style={{ fontSize:'1rem', color:'rgba(255,255,255,0.82)', lineHeight:1.7, maxWidth:'760px' }}>Analyze retinal fundus images using our ensemble of 4 deep learning architectures. Register patients, run screenings, and track DR progression over time.</p>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
                <StatCard val="0.908" label="Ensemble QWK Score" icon="📊" color={ACCENT}/>
                <StatCard val={String(patients.length)} label="Your Patients" icon="👥" color="#059669"/>
                <StatCard val={String(visits.length)} label="Total Screenings" icon="🔬" color="#7c3aed"/>
                <StatCard val="5" label="DR Severity Stages" icon="👁" color="#d97706"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'24px' }}>
                <div style={card}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}><span style={{ fontSize:'1.2rem' }}>🧠</span><h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827' }}>Ensemble Architecture</h3></div>
                  <p style={{ fontSize:'0.875rem', color:'#4b5563', lineHeight:1.7, marginBottom:'14px' }}>Four deep learning models run in parallel. Combined via averaged softmax probabilities - no single model decides alone.</p>
                  {['Input: 224x224 RGB fundus images','5-class severity classification (0-4)','Balanced training with APTOS 2019 dataset','Ensemble QWK: 0.908 - Excellent clinical range'].map(item=>(
                    <div key={item} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.875rem', color:'#374151', marginBottom:'7px' }}><span style={{ width:'6px', height:'6px', borderRadius:'50%', background:ACCENT, flexShrink:0, display:'inline-block' }}/>{item}</div>
                  ))}
                </div>
                <div style={card}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}><span style={{ fontSize:'1.2rem' }}>⚙️</span><h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827' }}>How It Works</h3></div>
                  {['Upload a retinal fundus photograph (JPG/PNG)','Advanced preprocessing: crop, enhance & normalize','All 4 models run simultaneously in parallel','Softmax probabilities averaged across models','Severity grade, confidence & referral guidance returned'].map((step,i)=>(
                    <div key={step} style={{ display:'flex', alignItems:'flex-start', gap:'12px', marginBottom:'10px' }}>
                      <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', color:'#fff', fontWeight:700, flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:'0.875rem', color:'#374151', lineHeight:1.6 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}><span style={{ fontSize:'1.2rem' }}>👁</span><h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827' }}>DR Severity Scale & Clinical Action</h3></div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px' }}>
                  {Object.entries(SEV).map(([key,m])=>(
                    <div key={key} style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:'10px', padding:'16px 12px', textAlign:'center' }}>
                      <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:m.color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:'0.9rem', margin:'0 auto 10px' }}>{key}</div>
                      <p style={{ fontWeight:700, color:m.color, fontSize:'0.85rem', marginBottom:'4px' }}>{m.label}</p>
                      <p style={{ fontSize:'0.72rem', color:'#6b7280', lineHeight:1.5, marginBottom:'8px' }}>{m.desc}</p>
                      <div style={{ fontSize:'0.68rem', fontWeight:700, color:m.color, background:m.badge, borderRadius:'6px', padding:'3px 6px' }}>{m.urgency}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {page==='analyze'&&(
            <>
              <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827', marginBottom:'24px' }}>Analyze Fundus Image</h2>
              <div style={{ display:'grid', gridTemplateColumns:'1.1fr 0.9fr', gap:'20px', alignItems:'start' }}>
                <div style={card}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                    <svg width="18" height="18" fill="none" stroke={ACCENT} strokeWidth="2" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
                    <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827' }}>Upload Fundus Image</h3>
                  </div>
                  <div style={{ marginBottom:'16px' }}>
                    <label style={lbl}>Link to Patient (required to save results)</label>
                    <select value={analyzePatientId} onChange={e=>setAnalyzePatientId(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                      <option value="">— Select patient —</option>
                      {patients.map(p=><option key={p.id} value={p.id}>{p.name} (Age {p.age})</option>)}
                    </select>
                  </div>
                  <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f);}}
                    style={{ border:`2px dashed ${drag?ACCENT:'#d1d5db'}`, borderRadius:'10px', padding:'36px 20px', textAlign:'center', cursor:'pointer', background:drag?'#eff6ff':'#f9fafb', transition:'all 0.2s', marginBottom:'16px', minHeight:'160px', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                    {preview?<img src={preview} alt="preview" style={{ maxHeight:'200px', borderRadius:'8px', objectFit:'cover', maxWidth:'100%' }}/>:<><svg width="40" height="40" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom:'12px' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p style={{ color:'#374151', fontSize:'0.9rem', fontWeight:600, marginBottom:'4px' }}>Click to upload fundus image</p><p style={{ color:'#9ca3af', fontSize:'0.8rem' }}>JPG / PNG · or drag and drop</p></>}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);}}/>
                  </div>
                  {file&&<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px', padding:'10px 14px', background:'#eff6ff', borderRadius:'8px', border:'1px solid #bfdbfe' }}><span style={{ color:ACCENT, fontSize:'0.875rem', fontWeight:600 }}>Loaded: {file.name}</span><button onClick={reset} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontFamily:'inherit' }}>Clear</button></div>}
                  <div style={{ display:'flex', gap:'10px', marginBottom:'14px' }}>
                    <button onClick={predict} disabled={loading||!file} style={{ flex:1, padding:'12px', background:loading||!file?'#e5e7eb':ACCENT, border:'none', borderRadius:'8px', color:loading||!file?'#9ca3af':'#fff', fontWeight:700, fontSize:'0.95rem', cursor:loading||!file?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', fontFamily:'inherit' }}>
                      {loading?<><span style={{ width:'15px', height:'15px', border:'2px solid rgba(37,99,235,0.3)', borderTopColor:ACCENT, borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }}/> Analyzing...</>:<>Run All Models</>}
                    </button>
                    <button onClick={reset} style={{ padding:'12px 20px', background:'#fff', border:'1px solid #d1d5db', borderRadius:'8px', color:'#374151', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Reset</button>
                  </div>
                  {result&&<div style={{ marginBottom:'14px' }}><label style={lbl}>Clinical Notes</label><textarea value={clinicalNotes} onChange={e=>setClinicalNotes(e.target.value)} placeholder="Add clinical observations..." style={{ ...inp, resize:'vertical', minHeight:'75px' }}/></div>}
                  {result&&analyzePatientId&&!savedVisitId&&<button onClick={saveVisit} disabled={savingVisit} style={{ width:'100%', padding:'11px', background:'#059669', border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, fontSize:'0.9rem', cursor:savingVisit?'not-allowed':'pointer', fontFamily:'inherit', marginBottom:'10px' }}>{savingVisit?'Saving...':'Save to Patient Record'}</button>}
                  {savedVisitId&&<div style={{ padding:'10px 14px', background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:'8px', color:'#065f46', fontSize:'0.875rem', fontWeight:600, marginBottom:'10px' }}>Visit saved to patient record!</div>}
                  {error&&<div style={{ padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.875rem' }}>{error}</div>}
                  {result && (
                    <button onClick={async()=>{
                      const p = patients.find((x:any)=>x.id===analyzePatientId);
                      await exportAnalysisPDF({ patient: p ?? { name:"Unknown", age:0, gender:"", phone:"", diabetes_duration:"" }, doctor, result, imageSrc: preview, clinicalNotes, date: new Date().toISOString() });
                    }} style={{ width:"100%", padding:"11px", background:"#111827", border:"none", borderRadius:"8px", color:"#fff", fontWeight:700, fontSize:"0.9rem", cursor:"pointer", fontFamily:"inherit", marginBottom:"10px", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                      Export Clinical PDF Report
                    </button>
                  )}
                  <div style={{ marginTop:'14px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'10px', padding:'14px 16px' }}>
                    <p style={{ fontWeight:700, fontSize:'0.8rem', color:'#1e40af', marginBottom:'5px' }}>About Diabetic Retinopathy</p>
                    <p style={{ fontSize:'0.8rem', color:'#3730a3', lineHeight:1.65 }}>DR progresses from microaneurysms to neovascularization. Early detection can prevent up to 95% of DR-related blindness.</p>
                  </div>
                </div>

                <div style={{ ...card, minHeight:'420px', display:'flex', flexDirection:'column', borderColor:result&&sev?sev.border:'#e5e7eb', background:result&&sev?sev.bg:'#fff' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                    <svg width="18" height="18" fill="none" stroke={result&&sev?sev.color:'#6b7280'} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827' }}>Analysis Results</h3>
                  </div>
                  {!result&&!loading&&<div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#9ca3af' }}><svg width="48" height="48" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom:'14px' }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><p style={{ fontSize:'0.9rem', textAlign:'center' }}>Upload an image and click Run All Models</p></div>}
                  {loading&&<div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px' }}><div style={{ display:'flex', gap:'8px' }}>{[0,1,2,3].map(i=><div key={i} style={{ width:'10px', height:'10px', borderRadius:'50%', background:ACCENT, animation:`bounce 1.1s ${i*0.15}s infinite` }}/>)}</div><p style={{ fontSize:'0.9rem', color:'#6b7280' }}>Running ensemble inference...</p></div>}
                  {result&&sev&&(
                    <>
                      <div style={{ textAlign:'center', padding:'20px', background:'#fff', borderRadius:'10px', marginBottom:'14px', border:`1px solid ${sev.border}` }}>
                        <div style={{ display:'inline-block', background:sev.badge, color:sev.color, fontWeight:700, fontSize:'0.72rem', padding:'3px 12px', borderRadius:'100px', marginBottom:'8px', textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>Ensemble Prediction</div>
                        <div style={{ fontSize:'2.2rem', fontWeight:900, color:sev.color, letterSpacing:'-0.04em', marginBottom:'4px' }}>{result.ensemble_prediction.severity_text}</div>
                        <p style={{ fontSize:'0.85rem', color:'#6b7280', marginBottom:'12px' }}>{sev.desc}</p>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px', justifyContent:'center', marginBottom:'14px' }}>
                          <div style={{ flex:1, maxWidth:'160px', height:'8px', background:'#f3f4f6', borderRadius:'4px' }}><div style={{ height:'100%', borderRadius:'4px', width:`${(result.ensemble_prediction.confidence*100).toFixed(0)}%`, background:sev.color, transition:'width 1.2s ease' }}/></div>
                          <span style={{ fontSize:'1rem', fontWeight:800, color:sev.color }}>{(result.ensemble_prediction.confidence*100).toFixed(1)}%</span>
                        </div>
                        <div style={{ background:sev.bg, border:`1px solid ${sev.border}`, borderRadius:'8px', padding:'10px 14px', textAlign:'left' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#6b7280', textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:'3px' }}>Clinical Recommendation</div>
                          <div style={{ fontSize:'0.9rem', fontWeight:800, color:sev.color }}>{sev.urgency}</div>
                          <div style={{ fontSize:'0.8rem', color:'#4b5563', marginTop:'3px', lineHeight:1.5 }}>{sev.followUp}</div>
                        </div>
                      </div>
                      <p style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:'8px' }}>Model Consensus</p>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {Object.entries(result.individual_predictions).map(([model,data])=>{
                          const m=SEV[data.severity]??SEV[0]; const agrees=data.severity===result.ensemble_prediction.severity;
                          return (
                            <div key={model} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', borderRadius:'8px', padding:'10px 14px', border:'1px solid #e5e7eb' }}>
                              <div><p style={{ fontSize:'0.82rem', fontWeight:700, color:'#111827' }}>{MODEL_NAMES[model]??model}</p><p style={{ fontSize:'0.75rem', color:m.color, fontWeight:600, marginTop:'1px' }}>{m.label}</p></div>
                              <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 9px', borderRadius:'100px', background:agrees?'#ecfdf5':'#fef3c7', color:agrees?'#065f46':'#92400e', border:`1px solid ${agrees?'#a7f3d0':'#fde68a'}` }}>{agrees?'Agrees':'Differs'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {page==='patients'&&(
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px' }}>
                <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827' }}>Patient Records</h2>
                <button onClick={()=>{setShowAddPatient(true);setPErr('');}} style={{ padding:'10px 20px', background:ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'8px' }}><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Patient</button>
              </div>
              <div style={{ ...card, padding:'14px 18px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'12px' }}>
                <svg width="18" height="18" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={patientSearch} onChange={e=>setPatientSearch(e.target.value)} placeholder="Search by name, phone, or patient ID..." style={{ flex:1, border:'none', outline:'none', fontSize:'0.9rem', fontFamily:'inherit', color:'#374151', background:'transparent' }}/>
                {patientSearch&&<button onClick={()=>setPatientSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontFamily:'inherit' }}>Clear</button>}
              </div>
              {showAddPatient&&(
                <div style={{ ...card, marginBottom:'20px', border:'2px solid #bfdbfe', background:'#f0f7ff' }}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Register New Patient</h3>
                  <p style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:'14px' }}><span style={{ color:'#dc2626' }}>*</span> Required fields</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Full Name</label><input placeholder="Aryan Mercer" value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={inp}/></div>
                    {/* FIX 7: age with min/max */}
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Age</label><input type="number" placeholder="45" min={1} max={120} value={pForm.age} onChange={e=>setPForm(p=>({...p,age:e.target.value}))} style={inp}/></div>
                    {/* FIX 6: phone digits only, max 10 */}
                    <div><label style={lbl}><span style={{ color:'#dc2626' }}>*</span> Phone (10 digits)</label><input type="tel" placeholder="9876543210" value={pForm.phone} onChange={e=>setPForm(p=>({...p,phone:e.target.value.replace(/\D/g,'').slice(0,10)}))} maxLength={10} style={inp}/></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                    <div><label style={lbl}>Gender</label><select value={pForm.gender} onChange={e=>setPForm(p=>({...p,gender:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>{['Male','Female','Other'].map(g=><option key={g}>{g}</option>)}</select></div>
                    <div><label style={lbl}>Diabetes Duration</label><input placeholder="e.g. 5 years" value={pForm.diabetesDuration} onChange={e=>setPForm(p=>({...p,diabetesDuration:e.target.value}))} style={inp}/></div>
                    <div><label style={lbl}>Remarks</label><input placeholder="Any notes" value={pForm.notes} onChange={e=>setPForm(p=>({...p,notes:e.target.value}))} style={inp}/></div>
                  </div>
                  {/* FIX 8: show validation error */}
                  {pErr&&<div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.85rem', marginBottom:'12px' }}>⚠ {pErr}</div>}
                  <div style={{ display:'flex', gap:'10px' }}>
                    <button onClick={addPatient} disabled={addingPatient} style={{ padding:'10px 24px', background:ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{addingPatient?'Registering...':'Register Patient'}</button>
                    <button onClick={()=>{setShowAddPatient(false);setPErr('');}} style={{ padding:'10px 20px', background:'#fff', border:'1px solid #d1d5db', borderRadius:'8px', color:'#374151', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  </div>
                </div>
              )}
              {patients.length===0?(
                <div style={{ ...card, textAlign:'center', padding:'48px', color:'#9ca3af' }}>
                  <svg width="48" height="48" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin:'0 auto 14px', display:'block' }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  <p style={{ fontWeight:600, marginBottom:'6px' }}>{patientSearch?'No patients match':'No patients yet'}</p>
                  {!patientSearch&&<p style={{ fontSize:'0.85rem' }}>Click "Add Patient" to get started</p>}
                </div>
              ):(
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'14px' }}>
                  {patients.map(p=>{
                    const pv=visits.filter(v=>v.patient_id===p.id).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
                    const lastS=pv[0]?SEV[pv[0].severity]:null;
                    return (
                      <div key={p.id} onClick={()=>openPatient(p)} style={{ ...card, cursor:'pointer', transition:'all 0.15s', borderColor:lastS?.border??'#e5e7eb' }}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                            <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:`${ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>👤</div>
                            <div><p style={{ fontWeight:700, color:'#111827', fontSize:'0.95rem' }}>{p.name}</p><p style={{ fontSize:'0.75rem', color:'#6b7280' }}>{p.age}y · {p.gender}</p></div>
                          </div>
                          {lastS&&<div style={{ background:lastS.badge, color:lastS.color, fontSize:'0.72rem', fontWeight:700, padding:'3px 9px', borderRadius:'100px' }}>{lastS.label}</div>}
                        </div>
                        <div style={{ fontSize:'0.78rem', color:'#6b7280', marginBottom:'10px', display:'flex', gap:'14px' }}>
                          <span>{p.phone}</span>{p.diabetes_duration&&<span>{p.diabetes_duration}</span>}
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', paddingTop:'10px', borderTop:'1px solid #f3f4f6', fontSize:'0.78rem' }}>
                          <span style={{ color:'#9ca3af' }}>{pv.length} screening{pv.length!==1?'s':''}</span>
                          {pv[0]&&<span style={{ color:'#6b7280' }}>Last: {fmtDate(pv[0].date)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {page==='patient_detail'&&selectedPatient&&(
            <PatientDetail patient={selectedPatient} visits={patientVisits} onBack={()=>setPage('patients')} onAnalyze={()=>{setAnalyzePatientId(selectedPatient.id);setPage('analyze');}} doctor={doctor}/>
          )}

          {page==='about'&&(
            <>
              <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827', marginBottom:'24px' }}>Performance & About</h2>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'20px' }}>
                {[{val:'0.908',label:'Ensemble QWK - Excellent',icon:'🏅',color:ACCENT},{val:'0.909',label:'Best Model (ConvNeXt)',icon:'🏆',color:'#7c3aed'},{val:'>0.82',label:'All Models QWK',icon:'📊',color:'#059669'},{val:'3662',label:'Training Images (APTOS)',icon:'🗃',color:'#d97706'}].map(s=>(
                  <div key={s.label} style={{ ...card, display:'flex', flexDirection:'column', gap:'12px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>{s.icon}</div>
                    <div style={{ fontSize:'1.9rem', fontWeight:800, color:'#111827', letterSpacing:'-0.03em', lineHeight:1 }}>{s.val}</div>
                    <div style={{ fontSize:'0.88rem', color:'#6b7280', fontWeight:500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px' }}>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'14px' }}>Dataset - APTOS 2019</h3>
                  <p style={{ fontSize:'0.875rem', color:'#4b5563', lineHeight:1.75, marginBottom:'10px' }}>Trained on the APTOS 2019 Blindness Detection dataset - high-quality retinal fundus photographs from rural India, graded by certified ophthalmologists across 5 DR severity levels.</p>
                  <p style={{ fontSize:'0.875rem', color:'#4b5563', lineHeight:1.75 }}>Significant class imbalance addressed using balanced sampling to ensure equal learning across all severity stages.</p>
                </div>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'14px' }}>Preprocessing Pipeline</h3>
                  {[['Black border removal','Crops dark borders via intensity thresholding'],['Optic disc detection','Hough Circle Transform for circular cropping'],['Ben Graham preprocessing','Subtracts local average colour to enhance retinal structures'],['CLAHE enhancement','Improves microaneurysm and haemorrhage visibility'],['K-Means quantization','Reduces noise while preserving clinical features']].map(([t,d])=>(
                    <div key={t} style={{ display:'flex', gap:'10px', marginBottom:'10px', alignItems:'flex-start' }}>
                      <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:ACCENT, flexShrink:0, marginTop:'6px' }}/>
                      <div><p style={{ fontSize:'0.82rem', fontWeight:700, color:'#111827' }}>{t}</p><p style={{ fontSize:'0.78rem', color:'#6b7280', lineHeight:1.5 }}>{d}</p></div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:'16px', marginBottom:'20px' }}>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Test QWK by Model</h3>
                  <p style={{ fontSize:'0.8rem', color:'#9ca3af', marginBottom:'24px' }}>Scale: 0.75 to 1.0</p>
                  {PERF.map(d=>(
                    <div key={d.model} style={{ marginBottom:'16px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                        <span style={{ fontSize:'0.875rem', fontWeight:d.isEnsemble?700:500, color:d.isEnsemble?ACCENT:'#374151' }}>{d.model}{d.isEnsemble?' (Best)':''}</span>
                        <span style={{ fontSize:'0.875rem', fontWeight:700, color:d.color }}>{d.testQWK.toFixed(3)}</span>
                      </div>
                      <div style={{ height:'10px', background:'#f3f4f6', borderRadius:'6px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:bars?`${((d.testQWK-0.75)/0.25)*100}%`:'0%', background:d.isEnsemble?`linear-gradient(90deg,${ACCENT},#7c3aed)`:d.color, borderRadius:'6px', transition:'width 1.2s ease' }}/>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'4px' }}>Results Table</h3>
                  <p style={{ fontSize:'0.8rem', color:'#9ca3af', marginBottom:'20px' }}>Val & Test QWK</p>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
                    <thead><tr style={{ borderBottom:'2px solid #f3f4f6' }}>{['Model','Val','Test'].map(h=><th key={h} style={{ padding:'8px 10px', textAlign:h==='Model'?'left':'center', color:'#9ca3af', fontWeight:700, fontSize:'0.72rem', textTransform:'uppercase' as const }}>{h}</th>)}</tr></thead>
                    <tbody>{PERF.map((d,i)=>(<tr key={d.model} style={{ borderBottom:i<PERF.length-1?'1px solid #f3f4f6':'none', background:d.isEnsemble?'#eff6ff':'transparent' }}>
                      <td style={{ padding:'11px 10px', fontWeight:d.isEnsemble?700:500, color:d.isEnsemble?ACCENT:'#374151', fontSize:'0.85rem' }}>{d.model}{d.isEnsemble&&<span style={{ fontSize:'0.6rem', background:'#dbeafe', color:'#1d4ed8', borderRadius:'4px', padding:'1px 5px', marginLeft:'6px', fontWeight:700 }}>BEST</span>}</td>
                      <td style={{ padding:'11px 10px', textAlign:'center', color:'#9ca3af', fontSize:'0.85rem' }}>{d.valQWK?d.valQWK.toFixed(3):'—'}</td>
                      <td style={{ padding:'11px 10px', textAlign:'center', color:d.color, fontWeight:700 }}>{d.testQWK.toFixed(3)}</td>
                    </tr>))}</tbody>
                  </table>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'16px' }}>
                <div style={{ ...card, borderLeft:`4px solid ${ACCENT}` }}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'10px' }}>Why Ensemble?</h3>
                  <p style={{ fontSize:'0.9rem', color:'#4b5563', lineHeight:1.8 }}>No single model is perfect. By combining four architecturally diverse networks, the ensemble averages out individual errors and yields QWK 0.908 - exceeding every individual model.</p>
                </div>
                <div style={{ ...card, borderLeft:'4px solid #f97316', background:'#fff7ed' }}>
                  <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#9a3412', marginBottom:'10px' }}>Disclaimer</h3>
                  <p style={{ fontSize:'0.875rem', color:'#7c2d12', lineHeight:1.75 }}>Academic research prototype. Not approved for clinical use. Must not replace diagnosis by a qualified ophthalmologist.</p>
                </div>
              </div>
            </>
          )}
        </main>

        <footer style={{ background:'#fff', borderTop:'1px solid #e5e7eb', padding:'14px 32px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.82rem', color:'#6b7280', fontWeight:600 }}>OpticNova · DR Detection System</span>
          <span style={{ fontSize:'0.78rem', color:'#9ca3af' }}>Academic Research Project · Ensemble QWK 0.908</span>
        </footer>
      </div>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } @keyframes spin{to{transform:rotate(360deg)}} @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PATIENT DETAIL
// ════════════════════════════════════════════════════════════════════════════
function PatientDetail({ patient, visits, onBack, onAnalyze, doctor }:{ patient:Patient; visits:Visit[]; onBack:()=>void; onAnalyze:()=>void; doctor:Doctor|null }) {
  const sorted=[...visits].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const latest=sorted[0]; const latestSev=latest?SEV[latest.severity]:null;
  const progression=sorted.slice().reverse();
  const getTrend=()=>{
    if(progression.length<2) return null;
    const diff=progression[progression.length-1].severity-progression[0].severity;
    if(diff>0) return{text:'Worsening',color:'#dc2626'};
    if(diff<0) return{text:'Improving',color:'#059669'};
    return{text:'Stable',color:'#2563eb'};
  };
  const trend=getTrend();

  const exportPDF = () => {
    const sevColors: Record<number,string> = {0:'#059669',1:'#2563eb',2:'#d97706',3:'#ea580c',4:'#dc2626'};
    const sevBg: Record<number,string>     = {0:'#ecfdf5',1:'#eff6ff',2:'#fffbeb',3:'#fff7ed',4:'#fef2f2'};
    const sevBorder: Record<number,string> = {0:'#a7f3d0',1:'#bfdbfe',2:'#fde68a',3:'#fed7aa',4:'#fecaca'};

    const historyRows = sorted.map(v => {
      const s = SEV[v.severity]??SEV[0];
      const indiv = v.individual_results??{};
      const modelRows = Object.entries(indiv).map(([m,d])=>{
        const ms = SEV[(d as any).severity]??SEV[0];
        const agrees = (d as any).severity === v.severity;
        return `<tr>
          <td style="padding:6px 10px;font-size:12px;color:#374151;">${MODEL_NAMES[m]??m}</td>
          <td style="padding:6px 10px;font-size:12px;color:${ms.color};font-weight:600;">${ms.label}</td>
          <td style="padding:6px 10px;font-size:12px;text-align:center;">
            <span style="background:${agrees?'#ecfdf5':'#fef3c7'};color:${agrees?'#065f46':'#92400e'};padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700;">${agrees?'Agrees':'Differs'}</span>
          </td>
        </tr>`;
      }).join('');
      return `
        <div style="margin-bottom:16px;border:1px solid ${sevBorder[v.severity]??'#e5e7eb'};border-radius:10px;overflow:hidden;">
          <div style="background:${sevBg[v.severity]??'#f9fafb'};padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:13px;color:#111827;">${fmtDate(v.date)}</span>
            <span style="background:${sevBg[v.severity]??'#f9fafb'};color:${sevColors[v.severity]??'#374151'};font-weight:700;font-size:12px;padding:3px 12px;border-radius:100px;border:1px solid ${sevBorder[v.severity]??'#e5e7eb'};">${s.label}</span>
          </div>
          <div style="padding:12px 16px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">
              Ensemble Confidence: <strong style="color:${sevColors[v.severity]??'#374151'};">${(v.confidence*100).toFixed(1)}%</strong>
              &nbsp;&middot;&nbsp; Image: ${v.image_name}
              &nbsp;&middot;&nbsp; <span style="color:${sevColors[v.severity]??'#374151'};font-weight:600;">${s.urgency}</span>
            </div>
            ${v.clinical_notes?`<div style="background:#f8fafc;border-left:3px solid ${sevColors[v.severity]??'#374151'};padding:8px 12px;border-radius:0 6px 6px 0;font-size:12px;color:#374151;margin-bottom:8px;"><strong>Clinical Notes:</strong> ${v.clinical_notes}</div>`:''}
            <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-top:6px;">
              <thead><tr style="background:#f3f4f6;">
                <th style="padding:6px 10px;font-size:11px;text-align:left;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Model</th>
                <th style="padding:6px 10px;font-size:11px;text-align:left;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Prediction</th>
                <th style="padding:6px 10px;font-size:11px;text-align:center;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Consensus</th>
              </tr></thead>
              <tbody>${modelRows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    const progressionBars = progression.map(v => {
      const s = SEV[v.severity]??SEV[0];
      const h = (v.severity+1)*28+8;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px;">
        <div style="font-size:10px;font-weight:700;color:${s.color};text-align:center;">${s.label}</div>
        <div style="width:40px;height:${h}px;background:${s.color};border-radius:4px 4px 0 0;display:flex;align-items:flex-start;justify-content:center;padding-top:4px;">
          <span style="font-size:11px;font-weight:800;color:#fff;">${v.severity}</span>
        </div>
        <div style="font-size:9px;color:#9ca3af;text-align:center;">${fmtDate(v.date)}</div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>OpticNova - ${patient.name} - Clinical Report</title>
    <style>* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Segoe UI',Arial,sans-serif; color:#111827; background:#fff; padding:32px; font-size:13px; } @media print { body { padding:16px; } @page { margin:12mm; size:A4; } }</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:3px solid #2563eb;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;">
          <div style="width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,0.6);position:relative;"><div style="width:6px;height:6px;border-radius:50%;background:white;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div></div>
        </div>
        <div><div style="font-size:22px;font-weight:800;color:#111827;">OpticNova</div><div style="font-size:11px;color:#6b7280;">AI-Powered Diabetic Retinopathy Detection</div></div>
      </div>
      <div style="text-align:right;"><div style="font-size:11px;color:#6b7280;">Clinical Report</div><div style="font-size:12px;font-weight:700;color:#374151;">Generated: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</div><div style="font-size:11px;color:#9ca3af;">Report ID: ON-${Date.now().toString(36).toUpperCase()}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Patient Information</div>
        <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:6px;">${patient.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;color:#374151;">
          <div><span style="color:#9ca3af;">Age:</span> ${patient.age}</div>
          <div><span style="color:#9ca3af;">Gender:</span> ${patient.gender}</div>
          <div><span style="color:#9ca3af;">Phone:</span> ${patient.phone}</div>
          <div><span style="color:#9ca3af;">Diabetes:</span> ${patient.diabetes_duration||'Not specified'}</div>
        </div>
        ${patient.notes?`<div style="margin-top:8px;font-size:11px;color:#6b7280;font-style:italic;">${patient.notes}</div>`:''}
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Attending Physician</div>
        <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:6px;">${doctor?.name??'—'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;color:#374151;">
          <div><span style="color:#9ca3af;">Hospital:</span> ${doctor?.hospital??'—'}</div>
          <div><span style="color:#9ca3af;">Specialization:</span> ${doctor?.specialization??'—'}</div>
          <div style="grid-column:1/-1;"><span style="color:#9ca3af;">Reg. No.:</span> ${doctor?.reg_no??'—'}</div>
        </div>
      </div>
    </div>
    ${latestSev&&latest?`<div style="background:${sevBg[latest.severity]??'#f9fafb'};border:2px solid ${sevBorder[latest.severity]??'#e5e7eb'};border-radius:12px;padding:20px;margin-bottom:20px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;"><div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Latest Diagnosis - ${fmtDate(latest.date)}</div><div style="font-size:26px;font-weight:900;color:${sevColors[latest.severity]??'#374151'};letter-spacing:-0.03em;">${latestSev.label}</div><div style="font-size:12px;color:#4b5563;margin-top:4px;">${latestSev.desc}</div></div><div style="text-align:right;"><div style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Ensemble Confidence</div><div style="font-size:28px;font-weight:900;color:${sevColors[latest.severity]??'#374151'};">${(latest.confidence*100).toFixed(1)}%</div><div style="font-size:11px;color:#6b7280;">4-model ensemble</div></div></div><div style="margin-top:14px;padding:12px 16px;background:white;border-radius:8px;border:1px solid ${sevBorder[latest.severity]??'#e5e7eb'};"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Clinical Recommendation</div><div style="font-size:15px;font-weight:800;color:${sevColors[latest.severity]??'#374151'};">${latestSev.urgency}</div><div style="font-size:12px;color:#4b5563;margin-top:3px;">${latestSev.followUp}</div></div></div>`:''}
    ${progression.length>1?`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:20px;"><div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:4px;">DR Progression Timeline</div><div style="font-size:11px;color:#9ca3af;margin-bottom:16px;">${progression.length} screenings - Trend: ${trend?trend.text:'—'}</div><div style="display:flex;align-items:flex-end;gap:12px;min-height:100px;">${progressionBars}</div></div>`:''}
    <div style="margin-bottom:20px;"><div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:12px;">Complete Screening History (${sorted.length} visit${sorted.length!==1?'s':''})</div>${historyRows||'<p style="color:#9ca3af;font-size:12px;">No screenings recorded.</p>'}</div>
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px;"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;"><div style="font-size:10px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Medical Disclaimer</div><div style="font-size:11px;color:#7c2d12;line-height:1.6;">This report is generated by OpticNova, an AI-assisted diabetic retinopathy screening tool developed as an academic research prototype. It is not approved for standalone clinical use and must not replace the diagnosis or clinical judgment of a qualified ophthalmologist.</div></div><div style="text-align:center;margin-top:12px;font-size:10px;color:#9ca3af;">OpticNova - AI-Powered DR Detection - Ensemble QWK 0.908 - Report generated ${new Date().toLocaleString('en-IN')}</div></div>
    </body></html>`;

    const win = window.open('','_blank','width=900,height=700');
    if(win){ win.document.write(html); win.document.close(); setTimeout(()=>win.print(),500); }
  };

  return (
    <div>
      <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:'8px', background:'none', border:'none', color:ACCENT, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginBottom:'20px', padding:0 }}>
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>Back to Patients
      </button>
      <div style={{ ...card, marginBottom:'20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <div style={{ width:'56px', height:'56px', borderRadius:'50%', background:`${ACCENT}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem' }}>👤</div>
          <div>
            <h2 style={{ fontSize:'1.3rem', fontWeight:800, color:'#111827', marginBottom:'5px' }}>{patient.name}</h2>
            <div style={{ display:'flex', gap:'16px', fontSize:'0.82rem', color:'#6b7280', flexWrap:'wrap' as const }}>
              <span>Age {patient.age}</span><span>{patient.gender}</span><span>{patient.phone}</span>
              {patient.diabetes_duration&&<span>Diabetes: {patient.diabetes_duration}</span>}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' as const }}>
          {latestSev&&<div style={{ background:latestSev.badge, color:latestSev.color, fontWeight:700, fontSize:'0.85rem', padding:'6px 14px', borderRadius:'100px', border:`1px solid ${latestSev.border}` }}>{latestSev.label}</div>}
          {trend&&<div style={{ fontSize:'0.82rem', fontWeight:700, color:trend.color, padding:'6px 12px', background:trend.color+'18', borderRadius:'100px' }}>{trend.text}</div>}
          <button onClick={exportPDF} style={{ padding:'10px 18px', background:'#fff', border:'2px solid #2563eb', borderRadius:'8px', color:ACCENT, fontWeight:700, fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export PDF
          </button>
          <button onClick={onAnalyze} style={{ padding:'10px 18px', background:ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:700, fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit' }}>+ New Screening</button>
        </div>
      </div>
      {progression.length>0&&(
        <div style={{ ...card, marginBottom:'20px' }}>
          <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'16px' }}>DR Progression Timeline</h3>
          <div style={{ display:'flex', alignItems:'flex-end', gap:'12px', overflowX:'auto' as const, paddingBottom:'4px', minHeight:'120px' }}>
            {progression.map((v,i)=>{ const s=SEV[v.severity]??SEV[0]; return (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', minWidth:'80px' }}>
                <div style={{ fontSize:'0.7rem', fontWeight:700, color:s.color, textAlign:'center' }}>{s.label}</div>
                <div style={{ width:'50px', background:s.color, borderRadius:'6px 6px 0 0', height:`${(v.severity+1)*22+10}px`, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'5px' }}>
                  <span style={{ fontSize:'0.8rem', fontWeight:800, color:'#fff' }}>{v.severity}</span>
                </div>
                <div style={{ fontSize:'0.68rem', color:'#9ca3af', textAlign:'center', lineHeight:1.3 }}>{fmtDate(v.date)}</div>
              </div>
            );})}
          </div>
          {progression.length===1&&<p style={{ fontSize:'0.8rem', color:'#9ca3af', marginTop:'10px' }}>More screenings will show progression trend here.</p>}
        </div>
      )}
      {latest&&latestSev&&(
        <div style={{ ...card, marginBottom:'20px', borderLeft:`4px solid ${latestSev.color}`, background:latestSev.bg }}>
          <h3 style={{ fontWeight:700, fontSize:'0.95rem', color:'#111827', marginBottom:'8px' }}>Current Clinical Recommendation</h3>
          <div style={{ fontSize:'1.05rem', fontWeight:800, color:latestSev.color, marginBottom:'4px' }}>{latestSev.urgency}</div>
          <div style={{ fontSize:'0.875rem', color:'#4b5563', lineHeight:1.6 }}>{latestSev.followUp}</div>
          <div style={{ fontSize:'0.75rem', color:'#9ca3af', marginTop:'8px' }}>Based on screening: {fmtDate(latest.date)}</div>
        </div>
      )}
      <div style={card}>
        <h3 style={{ fontWeight:700, fontSize:'1rem', color:'#111827', marginBottom:'16px' }}>Screening History ({sorted.length})</h3>
        {sorted.length===0?(
          <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af' }}>
            <p style={{ marginBottom:'12px' }}>No screenings yet.</p>
            <button onClick={onAnalyze} style={{ padding:'9px 18px', background:ACCENT, border:'none', borderRadius:'8px', color:'#fff', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Start First Screening</button>
          </div>
        ):(
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {sorted.map((v,i)=>{ const s=SEV[v.severity]??SEV[0]; const indiv=v.individual_results??{}; return (
              <div key={v.id} style={{ background:i===0?s.bg:'#f9fafb', border:`1px solid ${i===0?s.border:'#e5e7eb'}`, borderRadius:'10px', padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    {i===0&&<span style={{ fontSize:'0.68rem', fontWeight:700, background:s.badge, color:s.color, padding:'2px 8px', borderRadius:'100px' }}>LATEST</span>}
                    <span style={{ fontSize:'0.875rem', fontWeight:700, color:'#111827' }}>{fmtDate(v.date)}</span>
                  </div>
                  <div style={{ background:s.badge, color:s.color, fontWeight:700, fontSize:'0.8rem', padding:'4px 12px', borderRadius:'100px' }}>{s.label}</div>
                </div>
                <div style={{ display:'flex', gap:'20px', fontSize:'0.8rem', color:'#6b7280', marginBottom:'8px', flexWrap:'wrap' as const }}>
                  <span>Confidence: <strong style={{ color:s.color }}>{(v.confidence*100).toFixed(1)}%</strong></span>
                  <span>Image: {v.image_name}</span>
                  <span style={{ color:s.color, fontWeight:600 }}>{s.urgency}</span>
                </div>
                {v.clinical_notes&&<div style={{ padding:'9px 12px', background:'rgba(255,255,255,0.7)', borderRadius:'7px', fontSize:'0.82rem', color:'#374151', borderLeft:`3px solid ${s.color}`, marginBottom:'8px' }}><strong>Notes:</strong> {v.clinical_notes}</div>}
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' as const, marginTop:'6px' }}>
                  {Object.entries(indiv).map(([model,data])=>{ const ms=SEV[(data as any).severity]??SEV[0]; return <div key={model} style={{ fontSize:'0.7rem', padding:'3px 8px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'100px', color:ms.color, fontWeight:600 }}>{MODEL_NAMES[model]??model}: {ms.label}</div>; })}
                </div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
