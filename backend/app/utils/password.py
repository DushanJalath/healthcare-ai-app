import secrets
import string

def generate_secure_password(length: int = 12) -> str:
    """
    Generate a secure random password.
    
    Args:
        length: Length of the password (default: 12)
        
    Returns:
        A secure random password string
    """
    # Character sets
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    special_chars = "!@#$%&*"
    
    # Ensure at least one character from each set
    password = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(special_chars)
    ]
    
    # Fill the rest with random choices from all sets
    all_chars = lowercase + uppercase + digits + special_chars
    password.extend(secrets.choice(all_chars) for _ in range(length - 4))
    
    # Shuffle to avoid predictable pattern
    secrets.SystemRandom().shuffle(password)
    
    return ''.join(password)
