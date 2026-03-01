import smtplib
from email.mime.text import MIMEText
from os import getenv


def sendMessage(subject, message, to):
    msg_from = getenv("SMTP_USER")

    mime_message = MIMEText(message)
    mime_message['Subject'] = subject
    mime_message['From'] = msg_from
    mime_message['To'] = to

    with smtplib.SMTP_SSL(getenv("SMTP_HOST")) as smtps:
        smtps.login(msg_from, getenv("SMTP_PASS"))
        smtps.sendmail(
            msg_from,
            to,
            mime_message.as_string()
        )
