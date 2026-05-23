from app.database import Base  # ← добавь эту строку

from app.models.user import User
from app.models.character import Character
from app.models.tasks import DailyTask
from app.models.goals import Goal, SubTask
from app.models.habits import Habit, HabitCompletion
from app.models.shop import ShopItem, InventoryItem, CharacterEquipment
from app.models.challenges import Challenge, ChallengeParticipant
from app.models.social import Friendship, Post, PostReaction, MotivationalPing
from app.models.transactions import XPTransaction, CreditTransaction