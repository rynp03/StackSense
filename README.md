# 🧠 StackSense

**StackSense** is an AI-powered Chrome extension that helps developers understand code, debug issues, and evaluate real-world answers from **Stack Overflow** using intelligent confidence scoring and badge-based trust indicators.

Instead of blindly trusting search results, StackSense explains the problem first and then reviews community answers with AI-assisted reasoning.

---

## ✨ Features

### 🤖 AI Assistance
- Explain selected code or questions from any webpage
- Debug errors with language-aware explanations
- Improve code suggestions (AI-only mode)

---

### 🧵 Stack Overflow Intelligence Mode
When Stack mode is enabled, StackSense:
- Generates an optimized Stack Overflow search query using AI
- Fetches top questions and answers
- Analyzes each answer using:
  - ✅ Accepted status
  - 👍 Community vote count
  - 💬 Confused or negative comments
  - 🧠 AI confidence score

Each answer is assigned a **trust badge**.

---

### 🏅 Trust Badges

| Badge | Meaning |
|-----|--------|
| 🥇 Gold | Highly reliable, accepted or strongly upvoted |
| 🥈 Silver | Mostly correct with minor caveats |
| 🥉 Bronze | Partially correct or incomplete |
| ⚠️ Warning | Low confidence, outdated, or misleading |

---

### 📊 AI Confidence Meter
- Each answer includes a **confidence score (0–100%)**
- Confidence is calculated using:
  - Accepted answer priority
  - Vote-based weighting (capped)
  - Confusion penalty from comments
- Confidence bar animates on hover

---

### 🧠 “Why this badge?” Explanation
- Click on any badge to open a modal
- Shows **exact reasoning** behind the badge:
  - Accepted status
  - Vote influence
  - Confused comments detected
  - Final AI confidence score
- Modal color adapts to badge type (Gold / Silver / Bronze / Warning)

---

### 🎛️ Multiple Modes
- **AI Mode** – Pure AI explanation
- **Stack Mode** – AI + Stack Overflow review
- Clean toggle-based UI
- Improve Code action available only in AI mode

---

### 🧩 UX Highlights
- Chrome Side Panel (non-intrusive)
- Smooth typing animation for AI responses
- Clear separation between:
  - AI explanation
  - Stack Overflow sources
  - Community comments
- Reset and context-aware footer

---

## 🎥 Demo Video

▶️ **Watch StackSense in action**

[Click here to watch the demo](demo/stacksense-demo.mp4)

