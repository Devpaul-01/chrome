const API_URL = 'https://api.birthdaymessaging.io/api/v1/register';

document.addEventListener('DOMContentLoaded', () => {
    const registerBtn = document.getElementById('register');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    registerBtn.addEventListener('click', async () => {
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();

        if (!email || !password || !confirmPassword) {
            alert('Please fill in all required fields.');
            return;
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        try {
            const response = await axios.post(API_URL, {
                firstName,
                lastName,
                email,
                password
            });

            const data = response.data;

            if (response.status === 201 || data?.message === 'User registered successfully') {
                alert('Registration successful!');
                window.location.href = '/BIRTHDAYMESSAGING-LEGACY/frontend/login.html';
            } else {
                alert(data?.message || 'Unexpected server response.');
            }
        } catch (error) {
            console.error(error);
            alert('Error during registration or server issue.');
        }
    });
});