import sys
import os
import sqlite3
import numpy as np
import mne
import pandas as pd
import joblib
import xgboost as xgb
import tensorflow as tf
import pywt
from scipy.signal import welch, stft
from datetime import datetime, timedelta

from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QPushButton, QLabel, QFileDialog, QSlider, 
                             QProgressBar, QComboBox, QTabWidget, QTableWidget, 
                             QTableWidgetItem, QLineEdit, QFormLayout, QMessageBox, QHeaderView)
from PyQt6.QtCore import QTimer, Qt
import pyqtgraph as pg

# ==========================================
# 0. DATABASE INITIALIZATION
# ==========================================
def init_db():
    conn = sqlite3.connect("neuroguard_records.db")
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS patients 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age TEXT, notes TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS scans 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, 
                       file_name TEXT, channel TEXT, scan_date TEXT, seizure_count INTEGER)''')
    
    try: cursor.execute("ALTER TABLE scans ADD COLUMN channel TEXT DEFAULT 'Unknown'")
    except: pass 
    try: cursor.execute("ALTER TABLE scans ADD COLUMN seizure_details TEXT DEFAULT 'None'")
    except: pass 

    conn.commit()
    conn.close()

init_db()

# ==========================================
# 1. THE AI ENGINE
# ==========================================
WINDOW_DURATION = 5  
TARGET_RATE = 256    

def load_models():
    print("⏳ Loading Hybrid AI Models...")
    models = {}
    try: models['xgb'] = joblib.load('xgboost_seizure_model.json'); print("✅ XGBoost Loaded")
    except: models['xgb'] = None; print("⚠️ XGBoost missing.")
    try: models['rf'] = joblib.load('rf_chb_model.json'); print("✅ Random Forest Loaded")
    except: models['rf'] = None; print("⚠️ Random Forest missing.")
    try: models['svm'] = joblib.load('svm_chb_model.json'); print("✅ SVM Loaded")
    except: models['svm'] = None; print("⚠️ SVM missing.")
    try: models['cnn'] = tf.keras.models.load_model('cnn_bilstm_spectrogram_model.h5'); print("✅ CNN-BiLSTM Loaded")
    except: models['cnn'] = None; print("⚠️ CNN-BiLSTM missing.")
    return models

MODELS = load_models()

def extract_standard_features(window_data, fs):
    ch = window_data[0] if window_data.ndim == 2 else window_data    
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
    return np.array([line_len, energy, variance, zero_crossings, peak_to_peak, rms, delta, theta, alpha, beta, gamma]).reshape(1, -1)

def extract_wavelet_features(window_data):
    data = window_data[0] if window_data.ndim == 2 else window_data
    try: coeffs = pywt.wavedec(data, 'db4', level=5)
    except: return np.zeros((1, 16))
    features = []
    for coef in coeffs:
        energy = np.sum(coef ** 2) / (len(coef) + 1e-9)
        p = np.abs(coef) ** 2
        p = p / (np.sum(p) + 1e-9)
        entropy = -np.sum(p * np.log(p + 1e-9))
        features.extend([energy, entropy])
    features.extend([np.mean(data), np.std(data), np.max(data), np.min(data)])
    return np.array(features).reshape(1, -1)

def create_spectrogram(window_data, fs):
    data = window_data[0] if window_data.ndim == 2 else window_data
    f, t, Zxx = stft(data, fs, nperseg=128, noverlap=64)
    return np.log1p(np.abs(Zxx))[np.newaxis, ..., np.newaxis]

def process_file(raw, channel_name, user_threshold, progress_callback=None):
    start_time = raw.info.get('meas_date', None)
    if start_time is None: start_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_time = start_time.replace(tzinfo=None)

    raw_ch = raw.copy().pick_channels([channel_name])
    raw_ch.filter(0.5, 60.0, verbose=False)
    data = raw_ch.get_data()[0] * 1e6 
    sfreq = raw_ch.info['sfreq']
    
    samples_per_window = int(WINDOW_DURATION * sfreq)
    total_windows = len(data) // samples_per_window
    std_feats_batch, wave_feats_batch, spec_feats_batch, valid_windows = [], [], [], []
    
    arr_line_len = np.zeros(total_windows)
    arr_rms = np.zeros(total_windows)
    arr_bpr = np.zeros(total_windows)
    arr_hf_power = np.zeros(total_windows) 
    arr_zcr = np.zeros(total_windows)      
    
    for i in range(total_windows):
        start = i * samples_per_window
        window = data[start : start + samples_per_window]
        
        if np.max(np.abs(window)) <= 500:
            std_feats = extract_standard_features(window, sfreq)[0]
            std_feats_batch.append(std_feats)
            wave_feats_batch.append(extract_wavelet_features(window)[0])
            if MODELS['cnn']: spec_feats_batch.append(create_spectrogram(window, sfreq)[0])
            valid_windows.append(i)
            
            arr_line_len[i] = std_feats[0]
            arr_zcr[i] = std_feats[3] 
            arr_rms[i] = std_feats[5]
            arr_bpr[i] = (std_feats[7] + std_feats[8]) / (std_feats[6] + 1e-9) 
            arr_hf_power[i] = std_feats[9] + std_feats[10] 
            
        if progress_callback and i % 10 == 0: 
            progress_callback(int((i / total_windows) * 50), "Extracting Features...")
            
    if progress_callback: progress_callback(60, "Running AI Inference...")
    p_xgb, p_rf, p_svm, p_cnn = np.zeros(total_windows), np.zeros(total_windows), np.zeros(total_windows), np.zeros(total_windows)
    
    if valid_windows:
        X_std, X_wave = np.array(std_feats_batch), np.array(wave_feats_batch)
        if MODELS['xgb']: p_xgb[valid_windows] = MODELS['xgb'].predict_proba(X_std)[:, 1]
        if MODELS['rf']:  p_rf[valid_windows]  = MODELS['rf'].predict_proba(X_std)[:, 1]
        if MODELS['svm']: p_svm[valid_windows] = MODELS['svm'].predict_proba(X_wave)[:, 1]
        if MODELS['cnn'] and spec_feats_batch:
            p_cnn[valid_windows] = MODELS['cnn'].predict(np.array(spec_feats_batch), batch_size=32, verbose=0)[:, 0]

    if progress_callback: progress_callback(90, "Applying Temporal Smoothing...")
    results, raw_probs = [], []
    for i in range(total_windows):
        ensemble_prob = min((p_xgb[i] * 0.35) + (p_rf[i] * 0.30) + (p_svm[i] * 0.15) + (p_cnn[i] * 0.25), 1.0)
        raw_probs.append(ensemble_prob)
        results.append({
            "Seconds": i * WINDOW_DURATION, 
            "XGBoost": p_xgb[i], "RandomForest": p_rf[i], "SVM": p_svm[i], "CNN": p_cnn[i], 
            "Smoothed_Prob": 0.0, "Line_Length": arr_line_len[i], "RMS": arr_rms[i], 
            "BPR": arr_bpr[i], "HF_Power": arr_hf_power[i], "ZCR": arr_zcr[i]
        })

    smoothed_probs = np.convolve(raw_probs, np.ones(5)/5, mode='same')
    seizure_events, in_seizure, start_event_sec = [], False, None
    on_trigger = user_threshold
    off_trigger = max(0.1, user_threshold - 0.10)
    
    for i in range(len(results)):
        prob = smoothed_probs[i]
        results[i]["Smoothed_Prob"] = prob
        
        if prob > on_trigger and not in_seizure:
            in_seizure, start_event_sec = True, results[i]["Seconds"]
        elif prob < off_trigger and in_seizure:
            in_seizure = False
            duration = results[i]["Seconds"] - start_event_sec
            if duration >= 10: seizure_events.append({"start_sec": start_event_sec, "end_sec": results[i]["Seconds"]})
            
    if in_seizure:
        duration = results[-1]["Seconds"] - start_event_sec
        if duration >= 10: seizure_events.append({"start_sec": start_event_sec, "end_sec": results[-1]["Seconds"]})

    if progress_callback: progress_callback(100, "Done!")
    return pd.DataFrame(results), seizure_events, data

# ==========================================
# 2. CUSTOM X-AXIS
# ==========================================
class CustomTimeAxis(pg.AxisItem):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.display_mode = "Seconds"
        self.start_datetime = None

    def tickStrings(self, values, scale, spacing):
        strings = []
        for v in values:
            if self.display_mode == "Real Time" and self.start_datetime is not None:
                dt = self.start_datetime + timedelta(seconds=v)
                strings.append(dt.strftime("%H:%M:%S"))
            else:
                strings.append(f"{v:.1f}s")
        return strings

# ==========================================
# 3. MAIN TABBED APPLICATION WINDOW
# ==========================================
class NeuroGuardApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("NeuroGuard: Clinical Hybrid EEG Monitor")
        self.resize(1250, 800)
        
        self.raw, self.eeg_data, self.results_df = None, None, None
        self.start_datetime, self.current_filename = None, ""
        self.current_sec, self.window_duration = 0.0, 10.0      
        self.seizure_events, self.overview_regions = [], []
        self.current_seizure_idx, self.last_stopped_idx = -1, -1
        self.is_playing = False
        self.target_rate = 256
        self.active_patient_id = None
        self.active_patient_name = "None (Guest Mode)"
        
        self.init_ui()
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_plot)
        self.load_patients() 
        
    def init_ui(self):
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        self.tab_patients = QWidget()
        self.tab_analyzer = QWidget()
        
        self.tabs.addTab(self.tab_patients, "👥 Patient Records")
        self.tabs.addTab(self.tab_analyzer, "🧠 Clinical Analyzer")
        
        self.setup_patients_tab()
        self.setup_analyzer_tab()

    # ---------------------------------------------------------
    # TAB 1: PATIENT DATABASE UI
    # ---------------------------------------------------------
    def setup_patients_tab(self):
        layout = QHBoxLayout(self.tab_patients)
        
        form_layout = QVBoxLayout()
        form_layout.addWidget(QLabel("<h2>Add New Patient</h2>"))
        self.inp_name = QLineEdit(); self.inp_name.setPlaceholderText("Patient Name")
        self.inp_age = QLineEdit(); self.inp_age.setPlaceholderText("Age / DOB")
        self.inp_notes = QLineEdit(); self.inp_notes.setPlaceholderText("Clinical Notes")
        
        f = QFormLayout()
        f.addRow("Name:", self.inp_name); f.addRow("Age:", self.inp_age); f.addRow("Notes:", self.inp_notes)
        form_layout.addLayout(f)
        
        btn_add = QPushButton("➕ Save Patient to Database")
        btn_add.setStyleSheet("background-color: #0078D7; color: white; padding: 10px;")
        btn_add.clicked.connect(self.add_patient)
        form_layout.addWidget(btn_add)
        form_layout.addStretch()
        layout.addLayout(form_layout, 1)
        
        table_layout = QVBoxLayout()
        table_layout.addWidget(QLabel("<h2>Patient Roster</h2>"))
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["ID", "Name", "Age", "Notes"])
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        table_layout.addWidget(self.table)
        
        btn_layout = QHBoxLayout()
        btn_select = QPushButton("✔️ Select Patient")
        btn_select.setStyleSheet("background-color: #107C10; color: white; padding: 10px; font-weight:bold;")
        btn_select.clicked.connect(self.select_patient)
        btn_layout.addWidget(btn_select)
        
        btn_history = QPushButton("📜 View History")
        btn_history.setStyleSheet("background-color: #603CBA; color: white; padding: 10px; font-weight:bold;")
        btn_history.clicked.connect(self.view_patient_history)
        btn_layout.addWidget(btn_history)
        
        btn_delete = QPushButton("🗑️ Delete Patient")
        btn_delete.setStyleSheet("background-color: #D83B01; color: white; padding: 10px; font-weight:bold;")
        btn_delete.clicked.connect(self.delete_patient)
        btn_layout.addWidget(btn_delete)
        
        btn_reset = QPushButton("⚠️ Factory Reset DB")
        btn_reset.setStyleSheet("background-color: #000000; color: #FF4444; padding: 10px; font-weight:bold;")
        btn_reset.clicked.connect(self.reset_database)
        btn_layout.addWidget(btn_reset)

        table_layout.addLayout(btn_layout)
        layout.addLayout(table_layout, 2)

    def load_patients(self):
        self.table.setRowCount(0)
        conn = sqlite3.connect("neuroguard_records.db")
        for row_idx, row_data in enumerate(conn.cursor().execute("SELECT * FROM patients")):
            self.table.insertRow(row_idx)
            for col_idx, data in enumerate(row_data):
                self.table.setItem(row_idx, col_idx, QTableWidgetItem(str(data)))
        conn.close()

    def add_patient(self):
        name, age, notes = self.inp_name.text(), self.inp_age.text(), self.inp_notes.text()
        if not name: return QMessageBox.warning(self, "Error", "Patient Name is required.")
        conn = sqlite3.connect("neuroguard_records.db")
        conn.cursor().execute("INSERT INTO patients (name, age, notes) VALUES (?, ?, ?)", (name, age, notes))
        conn.commit(); conn.close()
        self.inp_name.clear(); self.inp_age.clear(); self.inp_notes.clear(); self.load_patients()

    def select_patient(self):
        selected = self.table.selectedItems()
        if not selected: return QMessageBox.warning(self, "Error", "Select a patient first.")
        self.active_patient_id = int(selected[0].text())
        self.active_patient_name = selected[1].text()
        self.lbl_active_patient.setText(f"Active Patient: {self.active_patient_name} (ID: {self.active_patient_id})")
        self.tabs.setCurrentIndex(1) 

    def delete_patient(self):
        selected = self.table.selectedItems()
        if not selected: return QMessageBox.warning(self, "Error", "Select a patient to delete first.")
        patient_id, patient_name = int(selected[0].text()), selected[1].text()
        
        if QMessageBox.question(self, 'Confirm', f"Delete {patient_name} and ALL records?", 
                                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No) == QMessageBox.StandardButton.Yes:
            conn = sqlite3.connect("neuroguard_records.db")
            conn.cursor().execute("DELETE FROM patients WHERE id=?", (patient_id,))
            conn.cursor().execute("DELETE FROM scans WHERE patient_id=?", (patient_id,))
            conn.commit(); conn.close()
            if self.active_patient_id == patient_id:
                self.active_patient_id, self.active_patient_name = None, "None (Guest Mode)"
                self.lbl_active_patient.setText(f"Active Patient: {self.active_patient_name}")
            self.load_patients()

    def reset_database(self):
        reply = QMessageBox.question(self, 'FACTORY RESET', 
                                     "Are you absolutely sure you want to WIPE ALL patients and scan records?",
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No, 
                                     QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            conn = sqlite3.connect("neuroguard_records.db")
            cursor = conn.cursor()
            cursor.execute("DELETE FROM patients")
            cursor.execute("DELETE FROM scans")
            cursor.execute("DELETE FROM sqlite_sequence WHERE name='patients'")
            cursor.execute("DELETE FROM sqlite_sequence WHERE name='scans'")
            conn.commit(); conn.close()
            self.active_patient_id = None
            self.active_patient_name = "None (Guest Mode)"
            self.lbl_active_patient.setText(f"Active Patient: {self.active_patient_name}")
            self.load_patients()

    def view_patient_history(self):
        selected = self.table.selectedItems()
        if not selected: return QMessageBox.warning(self, "Error", "Select a patient first.")
        patient_id = int(selected[0].text())
        patient_name = selected[1].text()
        
        self.history_window = QMainWindow(self)
        self.history_window.setWindowTitle(f"Scan History: {patient_name}")
        self.history_window.resize(900, 450)
        
        cw = QWidget(); self.history_window.setCentralWidget(cw)
        layout = QVBoxLayout(cw)
        layout.addWidget(QLabel(f"<h2>Records for {patient_name}</h2>"))
        
        self.hist_table = QTableWidget(0, 6)
        self.hist_table.setHorizontalHeaderLabels(["Record ID", "File", "Channel", "Date", "Zones", "Timings (Duration)"])
        self.hist_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.hist_table.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.Stretch)
        self.hist_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        layout.addWidget(self.hist_table)
        
        btn_del_rec = QPushButton("🗑️ Delete Selected Record")
        btn_del_rec.setStyleSheet("background-color: #D83B01; color: white; padding: 10px; font-weight:bold;")
        btn_del_rec.clicked.connect(self.delete_scan_record)
        layout.addWidget(btn_del_rec)
        
        self.refresh_history_table(patient_id)
        self.history_window.show()

    def refresh_history_table(self, patient_id):
        self.hist_table.setRowCount(0)
        conn = sqlite3.connect("neuroguard_records.db")
        query = "SELECT id, file_name, channel, scan_date, seizure_count, seizure_details FROM scans WHERE patient_id=? ORDER BY id DESC"
        for row_idx, row_data in enumerate(conn.cursor().execute(query, (patient_id,))):
            self.hist_table.insertRow(row_idx)
            for col_idx, data in enumerate(row_data):
                item = QTableWidgetItem(str(data))
                if col_idx != 5: item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.hist_table.setItem(row_idx, col_idx, item)
        self.hist_table.resizeColumnsToContents()
        conn.close()

    def delete_scan_record(self):
        selected = self.hist_table.selectedItems()
        if not selected: return QMessageBox.warning(self.history_window, "Error", "Select a record to delete.")
        record_id = int(self.hist_table.item(selected[0].row(), 0).text())
        if QMessageBox.question(self.history_window, 'Confirm', "Delete this scan record?", 
                                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No) == QMessageBox.StandardButton.Yes:
            conn = sqlite3.connect("neuroguard_records.db")
            conn.cursor().execute("DELETE FROM scans WHERE id=?", (record_id,))
            conn.commit(); conn.close()
            patient_id = int(self.table.selectedItems()[0].text())
            self.refresh_history_table(patient_id)

    def save_scan_record(self, seizure_events, channel):
        if not self.active_patient_id: return 
        seizure_count = len(seizure_events)
        details_list = []
        for i, ev in enumerate(seizure_events):
            start = ev['start_sec']
            end = ev['end_sec']
            details_list.append(f"#{i+1}: {start:.1f}s-{end:.1f}s ({end-start:.1f}s)")
        details_str = " | ".join(details_list) if details_list else "No Seizures Detected"
        
        conn = sqlite3.connect("neuroguard_records.db")
        conn.cursor().execute("INSERT INTO scans (patient_id, file_name, channel, scan_date, seizure_count, seizure_details) VALUES (?, ?, ?, ?, ?, ?)",
                              (self.active_patient_id, self.current_filename, channel, datetime.now().strftime("%Y-%m-%d %H:%M"), seizure_count, details_str))
        conn.commit(); conn.close()

    # ---------------------------------------------------------
    # TAB 2: ANALYZER UI 
    # ---------------------------------------------------------
    def setup_analyzer_tab(self):
        layout = QVBoxLayout(self.tab_analyzer)
        
        top_layout = QHBoxLayout()
        self.lbl_active_patient = QLabel(f"Active Patient: {self.active_patient_name}")
        self.lbl_active_patient.setStyleSheet("font-size: 16px; font-weight: bold; color: #0078D7;")
        top_layout.addWidget(self.lbl_active_patient)
        
        self.btn_load = QPushButton("📂 Load EDF")
        self.btn_load.clicked.connect(self.load_file)
        top_layout.addWidget(self.btn_load)
        
        self.combo_channel = QComboBox(); self.combo_channel.setEnabled(False)
        self.combo_channel.currentIndexChanged.connect(self.on_channel_changed)
        top_layout.addWidget(QLabel(" Ch:"))
        top_layout.addWidget(self.combo_channel)

        self.combo_time_mode = QComboBox()
        self.combo_time_mode.addItems(["Seconds", "Real Time"])
        self.combo_time_mode.currentIndexChanged.connect(self.on_time_mode_changed)
        top_layout.addWidget(QLabel(" Time:"))
        top_layout.addWidget(self.combo_time_mode)

        self.lbl_info = QLabel("No file loaded."); top_layout.addWidget(self.lbl_info)
        top_layout.addStretch() 
        layout.addLayout(top_layout)
        
        self.time_axis = CustomTimeAxis(orientation='bottom')
        self.plot_widget = pg.PlotWidget(axisItems={'bottom': self.time_axis})
        self.plot_widget.setBackground('k')
        self.plot_widget.showGrid(x=True, y=True, alpha=0.3)
        self.plot_widget.setYRange(-300, 300)
        self.plot_widget.getViewBox().enableAutoRange(axis='x', enable=False)
        self.curve = self.plot_widget.plot(pen=pg.mkPen('#00FF00', width=1.5), autoDownsample=True)
        
        self.highlight_region = pg.LinearRegionItem(brush=(255, 0, 0, 50), movable=False)
        self.highlight_region.hide()
        self.plot_widget.addItem(self.highlight_region)
        layout.addWidget(self.plot_widget)

        slider_layout = QHBoxLayout()
        slider_layout.addWidget(QLabel("Timeline:"))
        self.time_slider = QSlider(Qt.Orientation.Horizontal)
        self.time_slider.setEnabled(False)
        self.time_slider.sliderMoved.connect(self.on_seek_moved)
        slider_layout.addWidget(self.time_slider)
        layout.addLayout(slider_layout)
        
        self.progress_bar = QProgressBar(); self.progress_bar.hide()
        layout.addWidget(self.progress_bar)

        self.lbl_alert = QLabel("STATUS: STANDBY")
        self.lbl_alert.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_alert.setStyleSheet("font-size: 20px; font-weight: bold; color: gray; background-color: black;")
        layout.addWidget(self.lbl_alert)
        
        bottom_layout = QHBoxLayout()
        self.btn_analyze = QPushButton("🧠 Run Hybrid AI"); self.btn_analyze.clicked.connect(self.run_ai); self.btn_analyze.setEnabled(False)
        self.btn_play = QPushButton("▶️ Play / Pause"); self.btn_play.clicked.connect(self.toggle_playback); self.btn_play.setEnabled(False)
        
        self.combo_speed = QComboBox()
        self.combo_speed.addItems(["1x", "2x", "4x", "8x"])
        self.combo_speed.setCurrentText("1x")
        self.combo_speed.setToolTip("Playback Speed")
        
        self.btn_next_seizure = QPushButton("⏭️ Next Seizure"); self.btn_next_seizure.clicked.connect(self.jump_to_seizure); self.btn_next_seizure.setEnabled(False)
        self.btn_overview = QPushButton("📈 Full Overview"); self.btn_overview.clicked.connect(self.show_full_overview); self.btn_overview.setEnabled(False)
        self.btn_probs = QPushButton("🔍 Model Breakdown"); self.btn_probs.clicked.connect(self.show_model_breakdown); self.btn_probs.setEnabled(False)
        self.btn_features = QPushButton("📊 Feature Plots"); self.btn_features.clicked.connect(self.show_feature_plots); self.btn_features.setEnabled(False)
        self.btn_features.setStyleSheet("background-color: #E3008C; color: white; font-weight: bold; padding: 8px;")
        
        bottom_layout.addWidget(self.btn_analyze)
        bottom_layout.addWidget(self.btn_play)
        bottom_layout.addWidget(self.combo_speed) 
        bottom_layout.addWidget(self.btn_next_seizure)
        bottom_layout.addWidget(self.btn_overview)
        bottom_layout.addWidget(self.btn_probs)
        bottom_layout.addWidget(self.btn_features) 

        self.lbl_slider = QLabel("Sens: 0.50"); bottom_layout.addWidget(self.lbl_slider)
        self.slider = QSlider(Qt.Orientation.Horizontal); self.slider.setRange(10, 90); self.slider.setValue(50)
        self.slider.valueChanged.connect(lambda v: self.lbl_slider.setText(f"Sens: {v/100:.2f}"))
        bottom_layout.addWidget(self.slider)
        
        layout.addLayout(bottom_layout)

    # ---------------------------------------------------------
    # APP LOGIC (File Loading & AI Trigger)
    # ---------------------------------------------------------
    def on_seek_moved(self, value):
        self.current_sec = float(value)
        self.last_stopped_idx = -1 
        self.update_plot()
        self.plot_widget.setXRange(self.current_sec, self.current_sec + self.window_duration, padding=0)

    def on_time_mode_changed(self):
        self.time_axis.display_mode = self.combo_time_mode.currentText()
        self.plot_widget.viewport().update()

    def auto_select_channel(self, ch_names):
        for target in ['F7-T7', 'F7-T3', 'EEG F7-T7', 'F8-T8', 'F8-T4', 'EEG F8-T8']:
            for ch in ch_names:
                if target.lower() in ch.lower().replace(" ", ""): return ch
        return ch_names[0]

    def load_file(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Open EDF", "", "EDF Files (*.edf)")
        if not file_path: return
        self.lbl_info.setText("Loading..."); QApplication.processEvents()
        
        try:
            self.raw = mne.io.read_raw_edf(file_path, preload=True, verbose=False)
            if int(self.raw.info['sfreq']) != self.target_rate: self.raw.resample(self.target_rate, npad="auto")
            
            meas_date = self.raw.info.get('meas_date', None)
            self.start_datetime = meas_date.replace(tzinfo=None) if meas_date else datetime.now()
            self.time_axis.start_datetime = self.start_datetime
            self.current_filename = os.path.basename(file_path)
            
            self.combo_channel.blockSignals(True) 
            self.combo_channel.clear(); self.combo_channel.addItems(self.raw.ch_names)
            best_ch = self.auto_select_channel(self.raw.ch_names)
            self.combo_channel.setCurrentText(best_ch)
            self.combo_channel.blockSignals(False); self.combo_channel.setEnabled(True)
            self.update_eeg_data(best_ch)
        except Exception as e: self.lbl_info.setText(f"Error: {e}")

    def on_channel_changed(self):
        if self.raw: self.update_eeg_data(self.combo_channel.currentText())

    def update_eeg_data(self, ch_name):
        self.eeg_data = self.raw.copy().pick_channels([ch_name]).get_data()[0] * 1e6
        self.lbl_info.setText(f"File: {self.current_filename} | Ch: {ch_name}")
        self.btn_analyze.setEnabled(True); self.btn_play.setEnabled(True)
        self.btn_overview.setEnabled(False); self.btn_next_seizure.setEnabled(False)
        self.btn_probs.setEnabled(False); self.btn_features.setEnabled(False) 
        self.btn_analyze.setText("🧠 Run Hybrid AI") 
        if self.is_playing: self.toggle_playback()
        
        self.current_sec, self.last_stopped_idx, self.seizure_events = 0.0, -1, []
        self.highlight_region.hide()
        for r in self.overview_regions: self.plot_widget.removeItem(r)
        self.overview_regions.clear(); self.window_duration = 10.0
        
        total_seconds = len(self.eeg_data) / self.target_rate
        self.time_slider.setEnabled(True)
        self.time_slider.setRange(0, int(total_seconds))
        self.time_slider.setValue(0)
        
        self.update_plot(); self.plot_widget.setXRange(0, 10.0, padding=0)

    def update_progress(self, value, text):
        self.progress_bar.setValue(value); self.btn_analyze.setText(text); QApplication.processEvents() 

    def run_ai(self):
        if self.raw is None: return
        self.btn_analyze.setEnabled(False); self.combo_channel.setEnabled(False); self.progress_bar.show()
        
        selected_ch = self.combo_channel.currentText()
        self.results_df, self.seizure_events, _ = process_file(self.raw, selected_ch, self.slider.value()/100.0, self.update_progress)
        
        self.progress_bar.hide(); self.combo_channel.setEnabled(True); self.btn_analyze.setEnabled(True)
        self.btn_probs.setEnabled(True); self.btn_features.setEnabled(True) 
        self.btn_analyze.setText(f"✅ Analysis Complete! ({len(self.seizure_events)} Zones)")
        
        self.save_scan_record(self.seizure_events, selected_ch)
        
        if self.seizure_events:
            self.btn_next_seizure.setEnabled(True); self.btn_overview.setEnabled(True)
            self.current_seizure_idx = -1 

    # ---------------------------------------------------------
    # ANIMATION & NAVIGATION LOGIC
    # ---------------------------------------------------------
    def show_model_breakdown(self):
        if self.results_df is None or self.results_df.empty: return
        self.prob_window = QMainWindow(self); self.prob_window.setWindowTitle("Model Breakdown"); self.prob_window.resize(1000, 400)
        
        prob_axis = CustomTimeAxis(orientation='bottom')
        prob_axis.display_mode = self.combo_time_mode.currentText()
        prob_axis.start_datetime = self.start_datetime
        
        plot = pg.PlotWidget(axisItems={'bottom': prob_axis}); plot.setBackground('k'); plot.addLegend(); plot.setYRange(0, 1.1)
        x = self.results_df["Seconds"].values
        plot.plot(x, self.results_df["XGBoost"].values, pen=pg.mkPen('#00BFFF', width=2), name='XGBoost')
        plot.plot(x, self.results_df["RandomForest"].values, pen=pg.mkPen('#32CD32', width=2), name='RF')
        plot.plot(x, self.results_df["SVM"].values, pen=pg.mkPen('#FFD700', width=2), name='SVM')
        plot.plot(x, self.results_df["CNN"].values, pen=pg.mkPen('#FF1493', width=2), name='CNN')
        self.prob_window.setCentralWidget(plot); self.prob_window.show()

    def show_feature_plots(self):
        if self.results_df is None or self.results_df.empty: return
        
        self.feat_window = QMainWindow(self)
        self.feat_window.setWindowTitle("Extracted Biomarkers Analysis")
        self.feat_window.resize(1000, 500) 
        
        cw = QWidget()
        self.feat_window.setCentralWidget(cw)
        layout = QVBoxLayout(cw)
        
        top_layout = QHBoxLayout()
        top_layout.addWidget(QLabel("<b>Select Biomarker to View:</b>"))
        
        self.combo_feat = QComboBox()
        self.combo_feat.setStyleSheet("font-size: 14px; padding: 5px;")
        self.combo_feat.addItems([
            "Line Length (Signal Complexity)",
            "RMS Energy (Raw Signal Power)",
            "Band Power Ratio (Theta+Alpha / Delta)",
            "High-Frequency Power (Beta + Gamma Hz)",
            "Zero-Crossing Rate (Oscillation Frequency)"
        ])
        top_layout.addWidget(self.combo_feat)
        top_layout.addStretch()
        layout.addLayout(top_layout)
        
        feat_axis = CustomTimeAxis(orientation='bottom')
        feat_axis.display_mode = self.combo_time_mode.currentText()
        feat_axis.start_datetime = self.start_datetime
        
        self.feat_plot = pg.PlotWidget(axisItems={'bottom': feat_axis})
        self.feat_plot.setBackground('k')
        self.feat_plot.showGrid(x=True, y=True, alpha=0.3)
        layout.addWidget(self.feat_plot)
        
        self.combo_feat.currentIndexChanged.connect(self.update_single_feature_plot)
        self.update_single_feature_plot()
        
        self.feat_window.show()

    def update_single_feature_plot(self):
        self.feat_plot.clear() 
        feat_name = self.combo_feat.currentText()
        x = self.results_df["Seconds"].values
        
        if "Line Length" in feat_name:
            y = self.results_df["Line_Length"].values
            pen = pg.mkPen('#00BFFF', width=2) 
        elif "RMS Energy" in feat_name:
            y = self.results_df["RMS"].values
            pen = pg.mkPen('#32CD32', width=2) 
        elif "Band Power Ratio" in feat_name:
            y = self.results_df["BPR"].values
            pen = pg.mkPen('#FFD700', width=2) 
        elif "High-Frequency" in feat_name:
            y = self.results_df["HF_Power"].values
            pen = pg.mkPen('#FF1493', width=2) 
        else: 
            y = self.results_df["ZCR"].values
            pen = pg.mkPen('#FFA500', width=2) 
            
        self.feat_plot.setTitle(feat_name)
        self.feat_plot.plot(x, y, pen=pen)
        
        for event in self.seizure_events:
            r = pg.LinearRegionItem(values=[event["start_sec"], event["end_sec"]], brush=(255, 0, 0, 50), movable=False)
            self.feat_plot.addItem(r)

    def show_full_overview(self):
        if self.eeg_data is None: return
        if self.is_playing: self.toggle_playback()
        self.highlight_region.hide()
        for r in self.overview_regions: self.plot_widget.removeItem(r)
        self.overview_regions.clear()
        
        total_seconds = len(self.eeg_data) / self.target_rate
        self.current_sec = 0.0
        self.window_duration = total_seconds 
        self.update_plot(); self.plot_widget.setXRange(0, total_seconds, padding=0)
        
        for event in self.seizure_events:
            r = pg.LinearRegionItem(values=[event["start_sec"], event["end_sec"]], brush=(255, 0, 0, 80), movable=False)
            self.plot_widget.addItem(r); self.overview_regions.append(r)
        self.lbl_alert.setText(f"📊 FULL FILE OVERVIEW ({len(self.seizure_events)} Zones Detected) 📊")
        self.lbl_alert.setStyleSheet("font-size: 20px; font-weight: bold; color: white; background-color: #107C10; padding: 5px;")

    def jump_to_seizure(self):
        if not self.seizure_events: return
        if self.is_playing: self.toggle_playback()
        for r in self.overview_regions: self.plot_widget.removeItem(r)
        self.overview_regions.clear() 
        
        self.current_seizure_idx = (self.current_seizure_idx + 1) % len(self.seizure_events)
        start_s, end_s = self.seizure_events[self.current_seizure_idx]["start_sec"], self.seizure_events[self.current_seizure_idx]["end_sec"]
        
        self.current_sec = max(0, start_s - 5.0) 
        self.last_stopped_idx = self.current_seizure_idx 
        self.highlight_region.setRegion([start_s, end_s]); self.highlight_region.show()
        
        duration = end_s - start_s; self.window_duration = duration + 10.0 
        self.update_plot(); self.plot_widget.setXRange(self.current_sec, self.current_sec + self.window_duration, padding=0)
        self.lbl_alert.setText(f"⚠️ VIEWING SEIZURE {self.current_seizure_idx + 1} ({duration:.1f}s) ⚠️")
        self.lbl_alert.setStyleSheet("font-size: 24px; font-weight: bold; color: white; background-color: red; padding: 10px;")

    def toggle_playback(self):
        self.is_playing = not self.is_playing
        if self.is_playing:
            self.highlight_region.hide()
            for r in self.overview_regions: self.plot_widget.removeItem(r)
            self.overview_regions.clear()
            if self.window_duration > 300: 
                self.window_duration = 10.0
                self.plot_widget.setXRange(self.current_sec, self.current_sec + self.window_duration, padding=0)
            self.timer.start(30); self.btn_play.setText("⏸️ Pause Monitor")
        else:
            self.timer.stop(); self.btn_play.setText("▶️ Play Monitor")

    def update_plot(self):
        if self.eeg_data is None: return
        start_idx = int(self.current_sec * self.target_rate)
        end_idx = int((self.current_sec + self.window_duration) * self.target_rate)
        
        if end_idx > len(self.eeg_data): end_idx = len(self.eeg_data)
        if start_idx >= len(self.eeg_data):
            if self.is_playing: self.toggle_playback()
            return
            
        chunk = self.eeg_data[start_idx:end_idx]
        actual_duration = len(chunk) / self.target_rate
        x_time = np.linspace(self.current_sec, self.current_sec + actual_duration, len(chunk))
        self.curve.setData(x=x_time, y=chunk)
        
        if not self.time_slider.isSliderDown():
            self.time_slider.blockSignals(True)
            self.time_slider.setValue(int(self.current_sec))
            self.time_slider.blockSignals(False)
        
        if self.is_playing:
            old_sec = self.current_sec
            
            speed_str = self.combo_speed.currentText().replace("x", "")
            speed_mult = float(speed_str)
            base_step = 0.03 
            self.current_sec += (base_step * speed_mult)
            
            if self.seizure_events:
                for i, event in enumerate(self.seizure_events):
                    if old_sec < event["start_sec"] <= self.current_sec:
                        if self.last_stopped_idx != i:
                            self.last_stopped_idx = i
                            self.current_seizure_idx = i - 1 
                            self.jump_to_seizure()
                            return 
            
            self.plot_widget.setXRange(self.current_sec, self.current_sec + self.window_duration, padding=0)
            self.lbl_alert.setText("STATUS: NORMAL")
            self.lbl_alert.setStyleSheet("font-size: 20px; font-weight: bold; color: #00FF00; background-color: black; padding: 5px;")

if __name__ == "__main__":
    from PyQt6.QtWidgets import QSplashScreen
    from PyQt6.QtGui import QPixmap, QFont
    import time
    
    app = QApplication(sys.argv)
    
    splash_pix = QPixmap(600, 300)
    splash_pix.fill(Qt.GlobalColor.darkBlue)
    splash = QSplashScreen(splash_pix, Qt.WindowType.WindowStaysOnTopHint)
    splash.showMessage("\n\n\n  NeuroGuard Clinical Suite\n  Initializing Hybrid AI Engine...", 
                       Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignBottom, Qt.GlobalColor.white)
    splash.setFont(QFont("Arial", 16, QFont.Weight.Bold))
    splash.show()
    app.processEvents()
    
    time.sleep(1.5) 
    
    window = NeuroGuardApp()
    window.show()
    splash.finish(window)
    sys.exit(app.exec())