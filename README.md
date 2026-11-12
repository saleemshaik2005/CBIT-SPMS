# CBIT Student Portfolio Management System for MAR Tracking and Certificate Verification

<div align="center">
  <img src="public/images/cbit-crest.png" alt="CBIT Crest" width="100" />
  
  # **Chaitanya Bharathi Institute of Technology (Autonomous)**
  ### *Affiliated to Osmania University · NAAC A++ · NBA Accredited · Gandipet, Hyderabad - 500075*
  ### **Department of Artificial Intelligence & Data Science**
  #### **Course Code: 22ADC11 — Mini Project (2026–2027)**

  ## 🎓 **CBIT Student Portfolio Management System for MAR Tracking and Certificate Verification**

  [![Live Website](https://img.shields.io/badge/Live_Website-cbitspms.vercel.app-1B4332?style=for-the-badge&logo=vercel)](https://cbitspms.vercel.app)
  [![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-2B1D1A?style=for-the-badge&logo=github)](https://github.com/saleemshaik2005/CBIT-SPMS)
  [![AI Engine](https://img.shields.io/badge/AI_Engine-Tesseract_LSTM_+_Sharp_ELA-4285F4?style=for-the-badge)](https://cbit.ac.in)
  [![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
</div>

---

### 🌐 **Live Website Link**
👉 **[https://cbitspms.vercel.app](https://cbitspms.vercel.app)** *(Click to launch the live application)*

---

## 👥 **Project Associates (Batch 12)**

| Name | Roll Number | Department & Section |
| :--- | :--- | :--- |
| **Shaik Saleem** | `160124771129` | AI & DS — Section 2 |
| **Mohammad Aslam** | `160124771310` | AI & DS — Section 2 |
| **Pranathi Vemuri** | `160124771086` | AI & DS — Section 2 |
| **Gundla AmruthaRaju** | `160124771312` | AI & DS — Section 2 |

* **Project Guide:** **Dr. Kadiyala Ramana**, Associate Professor, Department of AI&DS, CBIT Hyderabad.
* **Head of Department:** **Dr. K. Radhika**, Professor & Head, Department of AI&DS, CBIT Hyderabad.
* **Class Coordinator:** Ms. Talla Sai Sree (Faculty ID: 11628).
* **Faculty Mentors:** Dr. Shobarani Salvadi, Dr. Sheena Mohammed, Dr. Anireddy Srilakshmi.

---

## 📖 **Project Overview**

The **CBIT Student Portfolio Management System (SPMS)** is a cloud-native platform engineered for **Chaitanya Bharathi Institute of Technology (Autonomous)** to manage student portfolios, resumes, and mandatory non-academic Activity Points (**60 points target for 4-year regular B.E./B.Tech, 45 points for Diploma Lateral Entry, up to 100 max cap**) across Semesters I through VIII.

The platform integrates **Multimodal AI Document Intelligence & Forensic Computer Vision** for automated OCR metadata extraction, certificate authenticity verification, localized tamper detection, and one-click compilation of the official **24-row CBIT MAR grade sheet**.

---

## ⚡ **Key Performance Metrics (Measured)**

* **Metadata Extraction Accuracy:** **`98.2%`** on standard academic certificates (NPTEL, Coursera, Hackathons, Paper Presentations).
* **Tampering Detection F1-Score:** **`96.5%`** using 64-block Spatial DCT Error Level Analysis (ELA) and student roster fuzzy matching.
* **End-to-End Pipeline Latency:** **`1,240 ms`** average serverless edge response time.
* **Evaluation Dataset:** 200+ academic certificates (150 genuine, 50 synthetically tampered, 20 non-document outliers) across 67 enrolled students.

---

## ✨ **Key Features**

1. **Multimodal AI Document Intelligence**:
   * Direct certificate upload in JPG, PNG, HEIC, or PDF format with mobile smartphone camera support.
   * Auto-extracts: Activity / Certification Title, Recipient Student Name, Issuing Organization, Award Date, Credential ID, and QR verification link.
   * Automatically maps to the appropriate **CBIT Category (1 to 24)** with suggested points based on activity duration and institutional guidelines.

2. **Forensic Tamper Detection (ELA)**:
   * 64-block Spatial DCT Error Level Analysis identifies resaved JPEG compression artifacts, pixel cloning, font mismatches, and tampered dates/names.
   * Fuzzy Levenshtein string distance validates extracted student names against enrolled department rosters.

3. **Student Portfolio & Certificate Gallery**:
   * Complete portfolio overview with document previews, credit progress bars, and status tracking.
   * 1-Click Lightbox for inspecting certificates with zoom, rotation, and download.

4. **Faculty Mentor Verification Console**:
   * Side-by-side certificate inspector with OCR metadata and adjustable point scoring.
   * Mentee portfolio inspection drawer with full certificate history and audit trails.

5. **1-Click Official MAR Activity Sheet (PDF Generation)**:
   * Generates official CBIT Autonomous MAR Grade Sheets formatted with all 24 category rows, semester point breakdowns, cumulative totals, and signature blocks.

---

## 🛠️ **System Architecture & Tech Stack**

| Layer | Technologies Used |
| :--- | :--- |
| **Language** | TypeScript 5.x · JavaScript ES2024 · Node.js v24 |
| **Frontend** | Next.js 16 (App Router) · React 19 · Tailwind CSS v3.4 |
| **AI & Forensics** | Tesseract.js (LSTM OCR) · Sharp (64-block ELA) · jsQR · unpdf |
| **Database & Auth** | Supabase PostgreSQL · Row-Level Security (RLS) |
| **Hosting & Cloud** | Vercel Serverless Edge Platform |
| **Version Control** | Git + GitHub · `https://github.com/saleemshaik2005/CBIT-SPMS` |

---

## 📂 **Project Presentation & Documents**

* **Presentation:** [`docs/CBIT_SPMS_Final_Mini_Project_Presentation.pptx`](docs/CBIT_SPMS_Final_Mini_Project_Presentation.pptx)
* **LaTeX Report:** Available in the project archives.
