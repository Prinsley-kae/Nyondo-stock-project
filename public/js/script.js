// LOGIN AND SIGNUP PASSWORD INPUTS:
function toggleLoginPassword(event) {
  const input = document.getElementById("loginPassword");
  toggleField(input, event);
}

function toggleSignupPassword(event) {
  const input = document.getElementById("signupPassword");
  toggleField(input, event);
}

function toggleConfirmPassword(event) {
  const input = document.getElementById("confirmPassword");
  toggleField(input, event);
}

function toggleField(input, event) {
  const icon = event.target;

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}