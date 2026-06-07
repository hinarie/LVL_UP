from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum

class Gender(str, Enum):
    male = "male"
    female = "female"

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OnboardingRequest(BaseModel):
    display_name: str
    character_name: str
    gender: Gender
    username: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_onboarded: bool

class UserResponse(BaseModel):
    id: str
    email: str
    is_verified: bool
    is_onboarded: bool

    class Config:
        from_attributes = True