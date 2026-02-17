const API_RESET_BASE = 'https://api.birthdaymessaging.io/v1/reset-password';

function getTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tn')?.trim() || '';
}

document.addEventListener('DOMContentLoaded', () => {
  const updateBtn = document.getElementById('update');
  const pwdInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');

  const token = getTokenFromQuery();
  if (!token) {
    alert('Invalid or missing reset token.');
    window.location.href = './login.html';
    return;
  }

  updateBtn.addEventListener('click', async () => {
    const password = pwdInput.value.trim();
    const confirmPassword = confirmInput.value.trim();

    if (!password || !confirmPassword) {
      alert('Please enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      const url = `${API_RESET_BASE}?tn=${encodeURIComponent(token)}`;
      const response = await axios.post(url, { password });

      if (response.status === 200) {
        alert('Your password has been updated successfully.');
        window.location.href = './login.html';
      } else {
        alert(response.data?.message || 'Unexpected server response.');
      }
    } catch (err) {
      console.error(err);
      alert('Could not update password. The link may be invalid or expired.');
    }
  });
});