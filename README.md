# AnonChat 👻

**Pure Anonymous Messaging. No Logs. No Trace.**

AnonChat is a privacy-first real-time messaging application designed for instant, anonymous communication. Built with a modern "Matrix/Hacker" aesthetic, it prioritizes user privacy and data sovereignty.

![AnonChat Dashboard](https://github.com/pranitmitra21/AnonChat/blob/main/public/favicon.png) *(Add a screenshot here later!)*

## 🚀 Features

*   **🔒 Zero-Knowledge Privacy:** No emails, phone numbers, or passwords required. Just choose a nickname and chat.
*   **⚡ Real-Time Messaging:** Instant communication powered by Socket.io.
*   **🎭 Matrix Aesthetic:** Immersive dark mode UI with neon accents, glassmorphism, and particle animations.
*   **📁 IPFS Integration:** Decentralized storage support for secure message handling (Experimental).
*   **🛡️ Secure & Transient:** No server-side message persistence. Chat history lives only in your browser session.
*   **📱 Responsive Design:** Fully optimized for desktop and mobile devices.

## 🛠️ Tech Stack

*   **Frontend:** Vanilla JS, CSS3 (Glassmorphism), HTML5
*   **Backend:** Node.js, Express.js
*   **Real-time:** Socket.io
*   **Security:** Helmet.js, Rate Limiting
*   **Storage:** IPFS (Helia)

## 📋 Prerequisites

Before running this project, ensure you have the following installed:

*   **[Node.js](https://nodejs.org/):** Version 16.x or higher (LTS recommended)
*   **npm:** Node Package Manager (comes with Node.js)

## 📦 Dependencies

The project relies on the following key packages:

*   **[Express](https://expressjs.com/):** Web framework for Node.js.
*   **[Socket.io](https://socket.io/):** Enables real-time, bidirectional communication.
*   **[Helmet](https://helmetjs.github.io/):** Helps secure Express apps by setting HTTP response headers.
*   **[Express Rate Limit](https://www.npmjs.com/package/express-rate-limit):** Basic rate-limiting middleware to prevent brute-force attacks.

## 📦 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/pranitmitra21/AnonChat.git
    cd AnonChat
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```

4.  **Open in browser:**
    Navigate to `http://localhost:3000`

## ☁️ Deployment (Render)

1.  Push your code to GitHub.
2.  Create a **Web Service** on [Render](https://render.com).
3.  Connect your repository.
4.  Use the following settings:
    *   **Build Command:** `npm install`
    *   **Start Command:** `node server/index.js`

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

MIT License. Free to use and modify.
