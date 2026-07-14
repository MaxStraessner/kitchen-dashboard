from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

USERNAME_PATTERN = r"^[A-Za-z0-9._-]+$"


def camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=camel, populate_by_name=True, extra="forbid")


class PasswordPair(ApiModel):
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> "PasswordPair":
        if self.password != self.password_confirmation:
            raise ValueError("Die Passwörter stimmen nicht überein.")
        return self


class SetupStatus(ApiModel):
    setup_required: bool


class SetupInitialize(PasswordPair):
    household_name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=80)
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_PATTERN)


class LoginRequest(ApiModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class HouseholdSummary(ApiModel):
    id: str
    name: str


class CurrentUser(ApiModel):
    id: str
    username: str
    display_name: str
    household: HouseholdSummary
    role: Literal["admin", "member"]
    must_change_password: bool
    last_login_at: datetime | None = None


class CsrfResponse(ApiModel):
    csrf_token: str


class MessageResponse(ApiModel):
    message: str


class ChangePasswordRequest(ApiModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
    password_confirmation: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self) -> "ChangePasswordRequest":
        if self.new_password != self.password_confirmation:
            raise ValueError("Die Passwörter stimmen nicht überein.")
        if self.new_password == self.current_password:
            raise ValueError("Das neue Passwort muss sich vom bisherigen unterscheiden.")
        return self


class AccountUpdate(ApiModel):
    display_name: str = Field(min_length=1, max_length=80)


class AdminUserCreate(PasswordPair):
    display_name: str = Field(min_length=1, max_length=80)
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_PATTERN)
    role: Literal["admin", "member"] = "member"
    is_active: bool = True


class AdminUserUpdate(ApiModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    username: str | None = Field(
        default=None, min_length=3, max_length=32, pattern=USERNAME_PATTERN
    )
    role: Literal["admin", "member"] | None = None
    is_active: bool | None = None

    @field_validator("display_name", "username")
    @classmethod
    def reject_blank(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class ResetPasswordRequest(PasswordPair):
    pass


class AdminUserResponse(ApiModel):
    id: str
    username: str
    display_name: str
    role: Literal["admin", "member"]
    is_active: bool
    must_change_password: bool
    created_at: datetime
    last_login_at: datetime | None = None
