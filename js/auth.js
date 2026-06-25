// auth.js - Handles PIN input and Mock Authentication

document.addEventListener('DOMContentLoaded', () => {
    const pinDisplay = document.getElementById('pinDisplay');
    const dots = pinDisplay.querySelectorAll('.pin-dot');
    const keys = document.querySelectorAll('.key[data-key]');
    const btnClear = document.getElementById('keyClear');
    const btnBackspace = document.getElementById('keyBackspace');
    const authMessage = document.getElementById('authMessage');
    const authCard = document.getElementById('authCard');

    let currentPin = '';
    const PIN_LENGTH = 4;
    
    // Check if a PIN is already set in localStorage
    const savedPin = localStorage.getItem('rupeetrail_pin');
    let mode = savedPin ? 'verify' : 'setup';
    let setupFirstPin = '';

    function updateMessage() {
        if (mode === 'setup') {
            authMessage.textContent = 'Create a 4-digit PIN';
        } else if (mode === 'confirm') {
            authMessage.textContent = 'Confirm your PIN';
        } else {
            authMessage.textContent = 'Enter your PIN';
        }
        authMessage.style.color = 'var(--text-secondary)';
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

    function showError() {
        // Trigger shake animation
        authCard.classList.remove('shake');
        void authCard.offsetWidth; // Force reflow to restart animation
        authCard.classList.add('shake');
        
        // Show error state on dots
        dots.forEach(dot => {
            dot.classList.add('error');
            dot.classList.remove('filled');
        });
        
        authMessage.textContent = mode === 'confirm' ? 'PINs do not match. Try again.' : 'Incorrect PIN';
        authMessage.style.color = 'var(--color-danger)';
        
        // Reset after short delay
        setTimeout(() => {
            currentPin = '';
            updateDots();
            if (mode === 'confirm') {
                mode = 'setup';
                setupFirstPin = '';
            }
            updateMessage();
        }, 1000);
    }

    function handlePinComplete() {
        if (mode === 'setup') {
            setupFirstPin = currentPin;
            currentPin = '';
            mode = 'confirm';
            updateMessage();
            updateDots();
        } else if (mode === 'confirm') {
            if (currentPin === setupFirstPin) {
                // Save PIN and log in
                localStorage.setItem('rupeetrail_pin', currentPin);
                loginSuccess();
            } else {
                showError();
            }
        } else if (mode === 'verify') {
            if (currentPin === savedPin) {
                loginSuccess();
            } else {
                showError();
            }
        }
    }

    function loginSuccess() {
        authMessage.textContent = 'Authentication Success!';
        authMessage.style.color = 'var(--color-secondary)';
        dots.forEach(dot => {
            dot.style.backgroundColor = 'var(--color-secondary)';
            dot.style.borderColor = 'var(--color-secondary)';
        });
        
        // Mock authentication token
        localStorage.setItem('rupeetrail_auth', 'true');
        
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

    function removeDigit() {
        if (currentPin.length > 0) {
            currentPin = currentPin.slice(0, -1);
            updateDots();
        }
    }

    function clearPin() {
        currentPin = '';
        updateDots();
    }

    // Event Listeners for Screen Keypad
    keys.forEach(key => {
        key.addEventListener('click', () => {
            addDigit(key.getAttribute('data-key'));
        });
    });

    if(btnBackspace) btnBackspace.addEventListener('click', removeDigit);
    if(btnClear) btnClear.addEventListener('click', clearPin);

    // Keyboard support for numeric input
    document.addEventListener('keydown', (e) => {
        if (/^[0-9]$/.test(e.key)) {
            addDigit(e.key);
        } else if (e.key === 'Backspace') {
            removeDigit();
        } else if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Clear') {
            clearPin();
        }
    });

    // Initialize UI
    updateMessage();
});
