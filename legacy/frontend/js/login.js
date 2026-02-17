// login.js
// const API_URL = 'https://api.birthdaymessaging.io/api/v1/login';
const API_URL = 'https://api.birthdaymessaging.io/api/v1/login';
const BW_BASE_URL = 'https://db.birthdaymessaging.io/api/';
const BW_LOGIN_API = 'auth/login';

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const messageBox = document.querySelector('.form-error-message');

    const showMessage = (text, { type = 'error' } = {}) => {
        if (!messageBox) {
            return;
        }

        messageBox.textContent = text;
        messageBox.style.display = text ? 'block' : 'none';
        messageBox.classList.toggle('form-error-message--success', type === 'success');
        messageBox.dataset.type = type;
    };

    if (messageBox) {
        messageBox.style.display = 'none';
    }

    const computeDeviceId = () => {
        const navigatorInfo = window.navigator;
        const screenInfo = window.screen;
        let fingerprint = navigatorInfo.mimeTypes.length;
        fingerprint += navigatorInfo.userAgent.replace(/\D+/g, '');
        fingerprint += navigatorInfo.plugins.length;
        fingerprint += screenInfo.height || '';
        fingerprint += screenInfo.width || '';
        fingerprint += screenInfo.pixelDepth || '';
        return fingerprint;
    };

    const persistStore = async (email, data, bwToken) => {
        const userEmail = data.email || email;
        const storeUser = {
            email: userEmail,
            token: data.token || '',
            plan: data.plan || '',
            uid: computeDeviceId(),
            bw_token: bwToken || '',
        };
        const storePayload = { user: storeUser };
        localStorage.setItem('token', storeUser.token);
        localStorage.setItem('email', storeUser.email);
        localStorage.setItem('userId', data.id ?? data.userId ?? '');

        const storage = window.chrome?.storage?.local;
        if (storage?.set) {
            return new Promise((resolve) => storage.set({ store: storePayload, emailID: userEmail }, resolve));
        }

        return Promise.resolve();
    };

    const fetchBwToken = async (email) => {
        try {
            const response = await fetch(`${BW_BASE_URL}${BW_LOGIN_API}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            if (!response.ok) {
                return '';
            }
            const body = await response.json();
            return body?.payload?.bw_token || body?.bw_token || '';
        } catch (err) {
            console.error('Failed to fetch bw_token', err);
            return '';
        }
    };

    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            showMessage('Please enter both email and password.');
            return;
        }

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login request failed');
            }

            if (data && data.token) {
                const bwToken = await fetchBwToken(data.email || email);
                await persistStore(email, data, bwToken);

                showMessage('Login successful! Redirecting...', { type: 'success' });
                window.location.href = 'dashboard.html';
            } else {
                showMessage('Unexpected response from server.');
            }
        } catch (error) {
            console.error(error);
            showMessage(error.message || 'An error occurred while logging in.');
        }
    });
});
