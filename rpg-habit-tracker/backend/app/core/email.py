import random
import string
import aiosmtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from app.core.config import settings


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def get_otp_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=10)


def _render_otp_template(otp_code: str) -> str:
    template_path = Path(__file__).parent.parent / "templates" / "otp_email.html"
    try:
        template = template_path.read_text(encoding="utf-8")
        return template.replace("{{ otp_code }}", otp_code)
    except FileNotFoundError:
        # Fallback: простое текстовое письмо
        return f"""
        <html><body style="background:#0a0a0f;color:#f1f0ff;
        font-family:sans-serif;padding:40px;text-align:center;">
        <h1>LVL<span style="color:#9d5ff3;">UP</span></h1>
        <h2>Код подтверждения:</h2>
        <div style="font-size:48px;font-weight:900;
        color:#9d5ff3;letter-spacing:10px;">{otp_code}</div>
        <p style="color:#5a5a7a;">Действует 10 минут</p>
        </body></html>
        """


async def send_otp_email(email: str, otp: str):
    # Всегда печатаем в консоль (удобно для разработки)
    print(f"\n{'='*40}")
    print(f"📧 OTP для {email}: {otp}")
    print(f"{'='*40}\n")

    # Если SMTP не настроен — только консоль
    if not settings.MAIL_USERNAME or settings.MAIL_USERNAME == "your@email.com":
        print("⚠️  SMTP не настроен, письмо отправлено только в консоль")
        return

    try:
        html_content = _render_otp_template(otp)

        message = MIMEMultipart("alternative")
        message["Subject"] = "🎮 LVL UP — Код подтверждения"
        message["From"] = f"LVL UP <{settings.MAIL_FROM}>"
        message["To"] = email

        # Текстовая версия (fallback)
        text_part = MIMEText(
            f"Твой код подтверждения LVL UP: {otp}\n\nДействует 10 минут.",
            "plain",
            "utf-8"
        )
        html_part = MIMEText(html_content, "html", "utf-8")

        message.attach(text_part)
        message.attach(html_part)

        await aiosmtplib.send(
            message,
            hostname=settings.MAIL_SERVER,
            port=settings.MAIL_PORT,
            username=settings.MAIL_USERNAME,
            password=settings.MAIL_PASSWORD,
            start_tls=True,
        )
        print(f"✅ Письмо успешно отправлено на {email}")

    except Exception as e:
        print(f"❌ Ошибка отправки email: {e}")
        print("💡 OTP доступен выше в консоли")