"""Manual-entry synthetic ED/hospital EMR sepsis research demo."""
import sys
from pathlib import Path
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.mock_emr import load_bundle

st.set_page_config(page_title='Sepsis Signal | Hệ thống Cảnh báo sớm Nhiễm khuẩn huyết Lâm sàng', page_icon='🩺',
                   layout='wide', initial_sidebar_state='expanded')
st.markdown(r'''<style>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');

:root {
    --primary: #08749a;
    --primary-dark: #075e82;
    --section-header: #0875b5;
    --sidebar-bg: #f0f6fa;
    --sidebar-active: #d6ecfa;
    --border: #cedae4;
    --text: #17324d;
    --text-secondary: #64748b;
    --bg: #f2f6fa;
    --success: #15803d;
    --warning: #b45309;
    --danger: #b42318;
}

:root, html, body, [data-testid="stApp"], [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    color-scheme: light !important;
    font-family: "Be Vietnam Pro", "Segoe UI", sans-serif !important;
    background-color: var(--bg) !important;
    color: var(--text) !important;
}

/* Hide Streamlit's default header bar */
[data-testid="stHeader"] {
    background: transparent !important;
    height: 0 !important;
    min-height: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    pointer-events: none !important;
}
[data-testid="stAppDeployButton"],
[data-testid="stMainMenu"],
[data-testid="stToolbar"] {
    display: none !important;
}

/* Fixed Full-Width Clinical Header Bar */
.vm-app-header {
    height: 54px;
    position: fixed;
    z-index: 999990;
    top: 0;
    left: 0;
    right: 0;
    background: var(--primary);
    color: #ffffff !important;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 22px 0 18px;
    box-shadow: 0 1px 3px rgba(13, 71, 96, 0.14);
}
.vm-product-name {
    color: #ffffff !important;
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
}
.vm-product-mark {
    width: 32px;
    height: 32px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.3);
    display: inline-grid;
    place-items: center;
    font-size: 17px;
    font-weight: 700;
    color: #ffffff !important;
    flex-shrink: 0;
}
.vm-product-title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #ffffff !important;
    line-height: 1.2;
}
.vm-product-sub {
    display: block;
    color: #dff0f6 !important;
    font-size: 10px;
    letter-spacing: 1.2px;
    font-weight: 400;
    margin-top: 2px;
}
.vm-header-tools {
    display: flex;
    align-items: center;
    gap: 14px;
}
.vm-header-search-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: #ffffff !important;
    padding: 4px 11px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}
.vm-header-search-pill i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4ade80;
    display: inline-block;
}
.vm-account-box {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #ffffff !important;
    text-align: left;
}
.vm-avatar {
    height: 30px;
    width: 30px;
    border-radius: 50%;
    background: #e3eff8;
    border: 1.5px solid #ffffff;
    display: inline-grid;
    place-items: center;
    color: #075e82 !important;
    font-size: 11.5px;
    font-weight: 700;
    flex-shrink: 0;
}
.vm-account-text {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff !important;
    line-height: 1.2;
}
.vm-account-text small {
    display: block;
    font-size: 10px;
    color: #e3f2f7 !important;
    font-weight: 400;
}

/* Main workspace container: full width like enterprise.css (no huge side margins) */
.block-container,
[data-testid="stMainBlockContainer"],
[data-testid="stAppViewBlockContainer"] {
    max-width: 100% !important;
    padding-top: 68px !important;
    padding-bottom: 36px !important;
    padding-left: 28px !important;
    padding-right: 28px !important;
}

/* Sidebar */
[data-testid="stSidebar"] {
    top: 54px !important;
    height: calc(100vh - 54px) !important;
    background: var(--sidebar-bg) !important;
    border-right: 1px solid var(--border) !important;
}
[data-testid="stSidebarHeader"] {
    background: var(--sidebar-bg) !important;
    height: 60px !important;
    min-height: 60px !important;
    padding: 10px 14px !important;
    border-bottom: 1px solid var(--border) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
}
[data-testid="stSidebarHeader"]::before {
    content: "Phân hệ Lâm sàng\A Cấp cứu (ED) · Nội trú · ICU";
    white-space: pre;
    font-family: "Be Vietnam Pro", sans-serif !important;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text) !important;
}
[data-testid="stSidebarHeader"] button svg {
    fill: var(--primary) !important;
    color: var(--primary) !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] {
    padding: 6px 0 !important;
    border-bottom: 1px solid #dce7ef !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a {
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 9px 14px !important;
    min-height: 38px !important;
    border: 0 !important;
    border-left: 3px solid transparent !important;
    background: transparent !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a:hover {
    background: #e1eff8 !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a span,
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a svg {
    color: #17324d !important;
    fill: #2b5b80 !important;
    font-size: 13px !important;
    font-weight: 500 !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a[aria-current="page"] {
    border: 0 !important;
    border-left: 3px solid #008ac4 !important;
    background: var(--sidebar-active) !important;
    box-shadow: none !important;
}
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a[aria-current="page"] span,
[data-testid="stSidebar"] [data-testid="stSidebarNav"] a[aria-current="page"] svg {
    color: #075384 !important;
    fill: #075384 !important;
    font-weight: 600 !important;
}
.sb-assurance {
    padding: 10px 14px;
    color: var(--text);
    font-size: 12px;
    line-height: 1.5;
}
.sb-assurance-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--primary);
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 4px;
}
.sb-assurance small {
    display: block;
    color: var(--text-secondary);
    font-size: 11px;
    margin-top: 3px;
}

/* Typography */
[data-testid="stMain"] h1,
[data-testid="stMain"] h2,
[data-testid="stMain"] h3,
[data-testid="stMain"] h4,
[data-testid="stMain"] [data-testid="stHeadingWithActionElements"] * {
    font-family: "Be Vietnam Pro", "Segoe UI", sans-serif !important;
    color: #06466f !important;
    letter-spacing: -0.01em !important;
}
[data-testid="stMain"] h1 {
    font-size: 20px !important;
    font-weight: 700 !important;
    color: #06466f !important;
    margin: 0 0 2px 0 !important;
    padding: 0 !important;
}
[data-testid="stMain"] h3 {
    font-size: 14.5px !important;
    font-weight: 600 !important;
    color: #17324d !important;
    margin-top: 6px !important;
}
[data-testid="stMain"] h4 {
    font-size: 13px !important;
    font-weight: 600 !important;
    color: #075384 !important;
    margin-top: 4px !important;
}
[data-testid="stMain"] p,
[data-testid="stMain"] li,
[data-testid="stMain"] label,
[data-testid="stMain"] [data-testid="stWidgetLabel"] *,
[data-testid="stMain"] [data-testid="stMarkdownContainer"] {
    color: var(--text) !important;
    font-size: 13px !important;
}
[data-testid="stMain"] [data-testid="stCaptionContainer"],
[data-testid="stMain"] [data-testid="stCaptionContainer"] * {
    color: var(--text-secondary) !important;
    font-size: 11.5px !important;
    line-height: 1.5 !important;
}

/* Clean Section Header Bar */
.vm-panel-header {
    background: transparent !important;
    color: #06466f !important;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 0 6px 0;
    border-bottom: 1px solid #d8e2eb;
    border-radius: 0;
    margin: 18px 0 12px 0;
    font-size: 15px;
    font-weight: 700;
}
.vm-panel-header span {
    color: #06466f !important;
}
.vm-panel-sub {
    font-size: 12px;
    font-weight: 500;
    color: #64748b !important;
}

/* Sticky EHR Patient Banner (TREWS / Epic / Sepsis Watch style) */
.ehr-patient-banner {
    position: sticky;
    top: 56px;
    z-index: 99;
    background: #ffffff;
    border: 1px solid #bfd2e0;
    border-left: 4px solid var(--primary);
    border-radius: 5px;
    padding: 11px 18px;
    margin: 6px 0 14px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    box-shadow: 0 2px 8px rgba(15, 41, 66, 0.06);
}
.ehr-patient-banner.is-alert {
    border-left-color: var(--danger);
    background: #fffafa;
}
.ehr-patient-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}
.ehr-avatar {
    width: 38px;
    height: 38px;
    border-radius: 5px;
    background: #e6f3f8;
    border: 1px solid #b8d8e8;
    color: var(--primary-dark) !important;
    font-weight: 700;
    font-size: 13px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
}
.ehr-patient-banner.is-alert .ehr-avatar {
    background: #ffe7e3;
    border-color: #eab5ad;
    color: var(--danger) !important;
}
.ehr-patient-main {
    min-width: 0;
}
.ehr-patient-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.ehr-patient-code {
    font-size: 15.5px;
    font-weight: 700;
    color: #06466f !important;
    letter-spacing: -0.01em;
}
.ehr-patient-demo {
    font-size: 12.5px;
    color: #334e68 !important;
    font-weight: 500;
}
.ehr-patient-sub {
    font-size: 12px;
    color: var(--text-secondary) !important;
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}
.ehr-patient-center {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    border-left: 1px solid #dce6ee;
    border-right: 1px solid #dce6ee;
    padding: 2px 18px;
}
.ehr-timeline-step {
    font-size: 12px;
    color: var(--text-secondary) !important;
    line-height: 1.4;
}
.ehr-timeline-step strong {
    display: block;
    font-size: 13px;
    color: var(--text) !important;
    font-weight: 600;
}
.ehr-timeline-arrow {
    color: var(--primary) !important;
    font-weight: 700;
    font-size: 14px;
}
.ehr-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
}
.ehr-status-pill.safe {
    background: #dff1e5;
    color: #12612e !important;
    border: 1px solid #b7dfc4;
}
.ehr-status-pill.alert {
    background: #ffe7e3;
    color: #a8271b !important;
    border: 1px solid #eab5ad;
}
.ehr-status-pill.pending {
    background: #eef4f8;
    color: #334e68 !important;
    border: 1px solid #cbd9e4;
}

/* Inputs, selectboxes, number inputs */
[data-testid="stMain"] [data-baseweb="select"] > div,
[data-testid="stMain"] [data-baseweb="input"] > div,
[data-testid="stMain"] [data-baseweb="base-input"],
[data-testid="stMain"] [data-testid="stNumberInputContainer"],
[data-testid="stMain"] input,
[data-testid="stMain"] textarea {
    background-color: #ffffff !important;
    color: var(--text) !important;
    border-color: #b6c9d9 !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 13px !important;
}
[data-testid="stMain"] [data-baseweb="select"] > div:focus-within,
[data-testid="stMain"] [data-baseweb="input"] > div:focus-within,
[data-testid="stMain"] [data-testid="stNumberInputContainer"]:focus-within {
    border-color: var(--section-header) !important;
    box-shadow: 0 0 0 2px rgba(8, 117, 181, 0.14) !important;
}
[data-testid="stMain"] [data-baseweb="select"] *,
[data-testid="stMain"] [data-baseweb="input"] *,
[data-testid="stMain"] input::placeholder {
    color: var(--text) !important;
    -webkit-text-fill-color: var(--text) !important;
}
[data-testid="stMain"] [data-testid="stNumberInputStepDown"],
[data-testid="stMain"] [data-testid="stNumberInputStepUp"] {
    background-color: #f5f8fb !important;
    color: var(--text) !important;
    border-left: 1px solid #d5e2ec !important;
}
[data-testid="stMain"] [data-testid="stNumberInputStepDown"] svg,
[data-testid="stMain"] [data-testid="stNumberInputStepUp"] svg,
[data-testid="stMain"] [data-baseweb="select"] svg {
    fill: #2b5b80 !important;
    color: #2b5b80 !important;
}

/* Dropdown menu popover */
[data-baseweb="popover"],
[data-baseweb="menu"],
ul[role="listbox"],
li[role="option"] {
    background-color: #ffffff !important;
    color: var(--text) !important;
    border-radius: 4px !important;
    font-size: 13px !important;
}
li[role="option"]:hover,
li[role="option"][aria-selected="true"] {
    background-color: #e8f2f9 !important;
    color: var(--primary-dark) !important;
}

/* Tabs inside workbench */
[data-testid="stMain"] [data-baseweb="tab-list"] {
    gap: 6px !important;
    border-bottom: 1px solid var(--border) !important;
    padding-bottom: 0 !important;
}
[data-testid="stMain"] [data-baseweb="tab"] {
    padding: 8px 12px !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    color: var(--text-secondary) !important;
    background: transparent !important;
    border-radius: 4px 4px 0 0 !important;
}
[data-testid="stMain"] [data-baseweb="tab"][aria-selected="true"] {
    color: var(--primary-dark) !important;
    background: #edf6fc !important;
}
[data-testid="stMain"] [data-baseweb="tab-highlight"] {
    background-color: var(--section-header) !important;
    height: 2px !important;
}

/* Buttons */
[data-testid="stMain"] button[kind="primary"],
[data-testid="stMain"] [data-testid="stBaseButton-primary"],
[data-testid="stMain"] [data-testid="stFormSubmitButton"] button {
    background: var(--primary) !important;
    border: 1px solid var(--primary) !important;
    color: #ffffff !important;
    border-radius: 4px !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    padding: 7px 14px !important;
    min-height: 36px !important;
    box-shadow: none !important;
}
[data-testid="stMain"] button[kind="primary"]:hover,
[data-testid="stMain"] [data-testid="stBaseButton-primary"]:hover,
[data-testid="stMain"] [data-testid="stFormSubmitButton"] button:hover {
    background: var(--primary-dark) !important;
}
[data-testid="stMain"] button[kind="primary"] *,
[data-testid="stMain"] [data-testid="stBaseButton-primary"] *,
[data-testid="stMain"] [data-testid="stFormSubmitButton"] button * {
    color: #ffffff !important;
}
[data-testid="stMain"] button[kind="secondary"],
[data-testid="stMain"] [data-testid="stBaseButton-secondary"] {
    background-color: #ffffff !important;
    border: 1px solid #b9cbd9 !important;
    color: var(--text) !important;
    border-radius: 4px !important;
    font-weight: 500 !important;
    font-size: 12.5px !important;
    padding: 6px 12px !important;
    min-height: 36px !important;
    box-shadow: none !important;
}
[data-testid="stMain"] button[kind="secondary"]:hover,
[data-testid="stMain"] [data-testid="stBaseButton-secondary"]:hover {
    background-color: #eef6fc !important;
    border-color: var(--primary) !important;
}
[data-testid="stMain"] button[kind="secondary"] *,
[data-testid="stMain"] [data-testid="stBaseButton-secondary"] * {
    color: inherit !important;
}

/* Panels, Forms, Expanders */
[data-testid="stMain"] [data-testid="stExpander"] {
    background-color: #ffffff !important;
    border: 1px solid var(--border) !important;
    border-radius: 5px !important;
    box-shadow: none !important;
    overflow: hidden !important;
}
[data-testid="stMain"] [data-testid="stExpander"] details {
    border: none !important;
}
[data-testid="stMain"] [data-testid="stExpander"] summary {
    background-color: #f8fbfd !important;
    padding: 9px 14px !important;
    border: none !important;
}
[data-testid="stMain"] [data-testid="stExpander"] summary *,
[data-testid="stMain"] [data-testid="stExpander"] summary span,
[data-testid="stMain"] [data-testid="stExpander"] summary svg {
    color: #06466f !important;
    fill: var(--primary) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
}
[data-testid="stMain"] [data-testid="stForm"] {
    background-color: #ffffff !important;
    border: 1px solid var(--border) !important;
    border-radius: 5px !important;
    padding: 14px 16px !important;
    box-shadow: 0 1px 2px rgba(23, 50, 77, 0.02) !important;
}
div[data-testid="stVerticalBlockBorderWrapper"] {
    background-color: #ffffff !important;
    border: 1px solid var(--border) !important;
    border-radius: 5px !important;
    padding: 14px 16px !important;
    box-shadow: 0 1px 2px rgba(23, 50, 77, 0.02) !important;
}

/* Dataframes & Tables */
[data-testid="stDataFrame"] {
    background-color: #ffffff !important;
    border: 1px solid var(--border) !important;
    border-radius: 4px !important;
    overflow: hidden !important;
}

/* Alerts */
[data-testid="stMain"] [data-testid="stAlert"] {
    border: 1px solid #cfe1ef !important;
    background-color: #f1f7fc !important;
    color: #315a77 !important;
    border-radius: 4px !important;
    padding: 10px 12px !important;
    box-shadow: none !important;
}
[data-testid="stMain"] [data-testid="stAlert"] *,
[data-testid="stMain"] [data-testid="stAlert"] p,
[data-testid="stMain"] [data-testid="stAlert"] span {
    color: #17324d !important;
    font-size: 12.5px !important;
}
[data-testid="stMain"] [data-testid="stAlert"] svg {
    fill: var(--section-header) !important;
    color: var(--section-header) !important;
}

/* Metrics: Clean neutral white cards (NO blue left stripe on every box) */
[data-testid="stMetric"] {
    border: 1px solid #d8e2eb !important;
    background: #ffffff !important;
    border-radius: 5px !important;
    padding: 12px 16px !important;
    box-shadow: none !important;
}
[data-testid="stMetricValue"],
[data-testid="stMetricValue"] * {
    font-family: "Be Vietnam Pro", sans-serif !important;
    font-size: 22px !important;
    line-height: 1.25 !important;
    font-weight: 700 !important;
    color: #17324d !important;
    font-variant-numeric: tabular-nums !important;
}
[data-testid="stMetricLabel"],
[data-testid="stMetricLabel"] * {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: var(--text-secondary) !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
}

/* Badges & Tags */
.app-kicker {
    display: block;
    font-size: 11.5px;
    color: #526575 !important;
    margin-bottom: 2px;
}
.app-kicker b {
    color: var(--primary) !important;
    font-weight: 600;
}
.app-subtitle {
    color: var(--text-secondary) !important;
    font-size: 12.5px;
    margin: 0 0 10px 0;
    line-height: 1.45;
}
.tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 11.5px;
    color: #334e68 !important;
    background: #e8eef4;
    font-weight: 500;
    margin: 2px 5px 2px 0;
}
.tag-pill.warn {
    background: #fff0d2;
    color: #975008 !important;
}
.tag-pill.alert {
    background: #ffe7e3;
    color: #a8271b !important;
}
.tag-pill.ok {
    background: #dff1e5;
    color: #12612e !important;
}
.risk-card {
    border-radius: 4px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-top: 3px solid var(--primary);
    background: #f8fbfe;
    margin-bottom: 8px;
}
.risk-card.alert {
    background: #fff5f3;
    border-color: #eab5ad;
    border-top: 3px solid var(--danger);
}
.risk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
}
.risk-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #17324d !important;
}
.risk-badge {
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 3px;
}
.risk-badge.safe {
    background: #dff1e5;
    color: #12612e !important;
}
.risk-badge.alert {
    background: #ffe7e3;
    color: #a8271b !important;
}
.role-guide {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
    margin: 8px 0 14px;
}
.role-box {
    background: #ffffff;
    border: 1px solid #d8e2eb;
    border-radius: 5px;
    padding: 13px 15px;
    font-size: 12.5px;
    color: var(--text-secondary) !important;
    line-height: 1.55;
}
.role-box strong {
    color: #075384 !important;
    display: block;
    margin-bottom: 3px;
    font-size: 12.5px;
}
</style>''', unsafe_allow_html=True)

pages = [
    st.Page('pages/1_manual.py', title='Nhập ca và dự đoán', icon=':material/monitor_heart:', default=True),
    st.Page('pages/2_manual_watchlist.py', title='Danh sách theo dõi', icon=':material/view_list:'),
    st.Page('pages/3_model_monitoring.py', title='Giám sát mô hình', icon=':material/monitoring:'),
    st.Page('pages/4_sample_case.py', title='Ca mẫu từ EMR giả', icon=':material/science:'),
]

with st.sidebar:
    try:
        sepsis_meta = load_bundle('sepsis')[1]
        shock_meta = load_bundle('shock')[1]
        st.markdown(
            f'<div class="sb-assurance">'
            f'<div class="sb-assurance-head">✔ Mô hình demo · dữ liệu giả lập</div>'
            f'<div><b>Sepsis (6h tới):</b> Ngưỡng {sepsis_meta["threshold"]:.1%}</div>'
            f'<div><b>Sốc nhiễm khuẩn:</b> Ngưỡng {shock_meta["threshold"]:.1%}</div>'
            f'<small>Hồi quy Logistic v2 · 360 ca EMR theo giờ</small>'
            f'</div>',
            unsafe_allow_html=True,
        )
    except Exception as exc:
        st.error(f'Mô hình chưa khả dụng: {exc}')

st.markdown(
    '<header class="vm-app-header">'
    '<div class="vm-product-name">'
    '<span class="vm-product-mark">+</span>'
    '<div>'
    '<div class="vm-product-title">HỆ THỐNG CẢNH BÁO SỚM NHIỄM KHUẨN HUYẾT LÂM SÀNG (SEPSIS SIGNAL)</div>'
    '<small class="vm-product-sub">DỰ BÁO TRONG 6 GIỜ TỚI · HỒI QUY LOGISTIC V2 · CẤP CỨU (ED) → NỘI TRÚ → ICU</small>'
    '</div>'
    '</div>'
    '<div class="vm-header-tools">'
    '<div class="vm-header-search-pill"><i></i>Chu kỳ 60 phút · Cửa sổ (t, t+6h]</div>'
    '<div class="vm-account-box">'
    '<span class="vm-avatar">BS</span>'
    '<div class="vm-account-text">Bác sĩ / Điều dưỡng<small>Khoa Cấp cứu &amp; Nội trú</small></div>'
    '</div>'
    '</div>'
    '</header>',
    unsafe_allow_html=True,
)

navigation = st.navigation(pages, position='sidebar')
navigation.run()
