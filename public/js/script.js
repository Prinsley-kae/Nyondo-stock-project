/**
 * Toggles password visibility
 * @param {string} inputId - 
 * @param {HTMLElement} toggleElement - 
 */
function togglePassword(inputId, toggleElement) {
    const passwordInput = document.getElementById(inputId);
    const icon = toggleElement.querySelector('i');

    if (passwordInput.type === 'password') {
        // Show password
        passwordInput.type = 'text';
        // Change eye icon to eye-slash
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        // Hide password
        passwordInput.type = 'password';
        // Change back to eye icon
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}