import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from ..config import settings

logger = logging.getLogger(__name__)

def generate_welcome_email_html(
    first_name: str,
    email: str,
    password: str,
    login_url: str
) -> str:
    """Generate HTML email template for patient welcome email."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background-color: #2563eb;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 5px 5px 0 0;
            }}
            .content {{
                background-color: #f9fafb;
                padding: 30px;
                border: 1px solid #e5e7eb;
            }}
            .credentials {{
                background-color: white;
                padding: 20px;
                border-radius: 5px;
                margin: 20px 0;
                border-left: 4px solid #2563eb;
            }}
            .credential-item {{
                margin: 10px 0;
                padding: 10px;
                background-color: #f3f4f6;
                border-radius: 3px;
            }}
            .label {{
                font-weight: bold;
                color: #4b5563;
            }}
            .value {{
                color: #1f2937;
                font-family: monospace;
                font-size: 14px;
            }}
            .warning {{
                background-color: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .button {{
                display: inline-block;
                padding: 12px 24px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                color: #6b7280;
                font-size: 12px;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Welcome to Healthcare AI</h1>
        </div>
        <div class="content">
            <p>Dear {first_name},</p>
            
            <p>Welcome! Your patient account has been created. You can now access your medical records and documents through our secure portal.</p>
            
            <div class="credentials">
                <h3>Your Login Credentials:</h3>
                <div class="credential-item">
                    <span class="label">Email:</span>
                    <span class="value">{email}</span>
                </div>
                <div class="credential-item">
                    <span class="label">Temporary Password:</span>
                    <span class="value">{password}</span>
                </div>
            </div>
            
            <div class="warning">
                <strong>⚠️ Important Security Notice:</strong>
                <p>Please use the password above to log in for the first time. For your security, we strongly recommend changing your password immediately after logging in.</p>
            </div>
            
            <p style="text-align: center;">
                <a href="{login_url}" class="button">Login to Your Account</a>
            </p>
            
            <p>If you have any questions or need assistance, please contact your clinic directly.</p>
            
            <p>Best regards,<br>
            Healthcare AI Team</p>
        </div>
        <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© {settings.email_from_name}. All rights reserved.</p>
        </div>
    </body>
    </html>
    """

def generate_welcome_email_text(
    first_name: str,
    email: str,
    password: str,
    login_url: str
) -> str:
    """Generate plain text email template for patient welcome email."""
    return f"""
Welcome to Healthcare AI

Dear {first_name},

Welcome! Your patient account has been created. You can now access your medical records and documents through our secure portal.

Your Login Credentials:
Email: {email}
Temporary Password: {password}

IMPORTANT SECURITY NOTICE:
Please use the password above to log in for the first time. For your security, we strongly recommend changing your password immediately after logging in.

Login URL: {login_url}

If you have any questions or need assistance, please contact your clinic directly.

Best regards,
Healthcare AI Team

---
This is an automated message. Please do not reply to this email.
"""

def send_patient_welcome_email(
    to_email: str,
    first_name: str,
    password: str,
    login_url: Optional[str] = None
) -> bool:
    """
    Send welcome email to patient with login credentials.
    
    Args:
        to_email: Patient's email address
        first_name: Patient's first name
        password: Generated temporary password
        login_url: Optional custom login URL, defaults to frontend_url from settings
        
    Returns:
        True if email sent successfully, False otherwise
    """
    if not settings.smtp_username or not settings.smtp_password:
        logger.warning("Email configuration not set. Email will not be sent.")
        return False
    
    if not login_url:
        base = settings.frontend_url.rstrip("/")
        login_url = f"{base}/patient/login"
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = "Welcome to Healthcare AI - Your Account Credentials"
        msg['From'] = f"{settings.email_from_name} <{settings.email_from or settings.smtp_username}>"
        msg['To'] = to_email
        
        # Create both plain text and HTML versions
        text_content = generate_welcome_email_text(first_name, to_email, password, login_url)
        html_content = generate_welcome_email_html(first_name, to_email, password, login_url)
        
        # Attach parts
        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(html_content, 'html')
        
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
        
        logger.info(f"Welcome email sent successfully to {to_email}")
        return True
        
    except smtplib.SMTPException as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending email to {to_email}: {str(e)}")
        return False


def send_clinic_staff_welcome_email(
    to_email: str,
    first_name: str,
    password: str,
    clinic_name: Optional[str] = None,
    login_url: Optional[str] = None,
) -> bool:
    """Send clinic staff their email and temporary password; they sign in at the clinic portal."""
    if not settings.smtp_username or not settings.smtp_password:
        logger.warning("Email configuration not set. Email will not be sent.")
        return False

    base = settings.frontend_url.rstrip("/")
    if not login_url:
        login_url = f"{base}/clinic/login"

    clinic_line = f"<p><strong>Clinic:</strong> {clinic_name}</p>" if clinic_name else ""
    clinic_text = f"Clinic: {clinic_name}\n" if clinic_name else ""

    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
        <h1>Clinic staff account</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
        <p>Hello {first_name},</p>
        <p>An administrator has created a clinic staff account for you. Use the credentials below to sign in at the <strong>clinic portal</strong> (same page as other clinic users).</p>
        {clinic_line}
        <div style="background: white; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Email:</strong> {to_email}</p>
          <p><strong>Temporary password:</strong> <code style="font-size: 14px;">{password}</code></p>
        </div>
        <p style="background: #fef3c7; padding: 12px; border-radius: 6px;">Please change your password after first login.</p>
        <p><a href="{login_url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Open clinic sign in</a></p>
      </div>
      <p style="text-align: center; color: #6b7280; font-size: 12px;">This is an automated message.</p>
    </body></html>
    """

    text = f"""Clinic staff account

Hello {first_name},

An administrator created a clinic staff account for you.
{clinic_text}
Email: {to_email}
Temporary password: {password}

Sign in: {login_url}

Change your password after first login.
"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Your clinic staff account — MediKeep"
        msg["From"] = f"{settings.email_from_name} <{settings.email_from or settings.smtp_username}>"
        msg["To"] = to_email
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.smtp_server, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)

        logger.info(f"Staff welcome email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send staff welcome email to {to_email}: {e}")
        return False
