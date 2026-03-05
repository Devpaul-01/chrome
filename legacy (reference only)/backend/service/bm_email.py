from . import bm_smtp


def send_restore_password_email(email, token):
    link = f"https://api.birthdaymessaging.io/reset-password?tn={token}"
    bm_smtp.sendMessage("Password Reset", f"Click the link to reset your password: {link}", email)
