// auth.js - Handles PIN input and Authentication via API

document.addEventListener('DOMContentLoaded', () => {
    // If token exists, redirect to dashboard immediately
    if (localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'dashboard.html';
        return;
    }

    const pinDisplay = document.getElementById('pinDisplay');
    const dots = pinDisplay.querySelectorAll('.pin-dot');
    const keys = document.querySelectorAll('.keypad-btn[data-key]');
    const btnClear = document.getElementById('keyClear');
    const btnBackspace = document.getElementById('keyBackspace');
    const authMessage = document.getElementById('authMessage');
    const authCard = document.getElementById('authCard');

    let currentPin = '';
    const PIN_LENGTH = 4;
    
    // Clean up legacy auth keys
    localStorage.removeItem('rupeetrail_auth');
    localStorage.removeItem('rupeetrail_pin');

    function updateMessage(text, isError = false) {
        authMessage.textContent = text;
        authMessage.style.color = isError ? 'var(--color-danger)' : 'var(--text-secondary)';
    }

    function updateDots() {
        dots.forEach((dot, index) => {
            if (index < currentPin.length) {
                dot.classList.add('filled');
                dot.classList.remove('error');
            } else {
                dot.classList.remove('filled', 'error');
            }
        });
    }

    function showError(message) {
        // Trigger shake animation
        authCard.classList.remove('shake');
        void authCard.offsetWidth; // Force reflow to restart animation
        authCard.classList.add('shake');
        
        // Show error state on dots
        dots.forEach(dot => {
            dot.classList.add('error');
            dot.classList.remove('filled');
        });
        
        updateMessage(message || 'Incorrect PIN', true);
        
        // Reset after short delay
        setTimeout(() => {
            currentPin = '';
            updateDots();
            updateMessage('Enter your PIN');
        }, 1000);
    }

    async function handlePinComplete() {
        try {
            updateMessage('Authenticating...');
            const hashedPin = await window.hashPin(currentPin);
            const res = await window.api.login(hashedPin);
            
            if (res.token) {
                loginSuccess(res.token);
            } else {
                showError("Invalid PIN");
            }
        } catch(e) {
            console.error("Login failed", e);
            showError(e.message || "Authentication Failed");
        }
    }

    function loginSuccess(token) {
        authMessage.textContent = 'Authentication Success!';
        authMessage.style.color = 'var(--color-secondary)';
        dots.forEach(dot => {
            dot.style.backgroundColor = 'var(--color-secondary)';
            dot.style.borderColor = 'var(--color-secondary)';
        });
        
        // Store Session Token
        localStorage.setItem('rupeetrail_auth_token', token);
        
        // Redirect to Dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 600);
    }

    function addDigit(digit) {
        if (currentPin.length < PIN_LENGTH) {
            currentPin += digit;
            updateDots();
            
            // Check completion
            if (currentPin.length === PIN_LENGTH) {
                // Short delay to let the user see the last dot fill before action
                setTimeout(handlePinComplete, 150);
            }
        }
    }

    function backspace() {
        if (currentPin.length > 0) {
            currentPin = currentPin.slice(0, -1);
            updateDots();
        }
    }

    function clear() {
        currentPin = '';
        updateDots();
    }

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (/^[0-9]$/.test(e.key)) {
            addDigit(e.key);
        } else if (e.key === 'Backspace') {
            backspace();
        } else if (e.key === 'Escape' || e.key === 'Delete') {
            clear();
        }
    });

    // Touch/Click support for Keypad
    keys.forEach(key => {
        key.addEventListener('click', () => {
            addDigit(key.dataset.key);
            // Ripple effect
            key.style.transform = 'scale(0.9)';
            setTimeout(() => key.style.transform = 'scale(1)', 100);
        });
    });

    if (btnBackspace) btnBackspace.addEventListener('click', backspace);
    if (btnClear) btnClear.addEventListener('click', clear);
});
