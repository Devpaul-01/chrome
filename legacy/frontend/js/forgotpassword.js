const API_FORGOT_URL = 'https://api.birthdaymessaging.io/v1/forget-password';

document.addEventListener('DOMContentLoaded', () => {
  const resetBtn = document.getElementById('reset');
  const emailInput = document.getElementById('email');

  resetBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert('Please enter your email address.');
      return;
    }

    try {
      const response = await axios.post(API_FORGOT_URL, { email });
      if (response.status === 200) {
        alert('If your email exists in our system, a reset link has been sent.');
        window.location.href = './login.html';
      } else {
        alert(response.data?.message || 'Unexpected response from the server.');
      }
    } catch (err) {
      console.error(err);
      alert('Error sending reset link. Please try again later.');
    }
  });
});