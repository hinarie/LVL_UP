from pydantic import BaseModel
from typing import Optional
from enum import Enum

class PostVisibility(str, Enum):
    public = "public"
    friends = "friends"
    private = "private"

class PostCreate(BaseModel):
    content: str
    visibility: PostVisibility = PostVisibility.public

class FriendRequestCreate(BaseModel):
    addressee_email: str