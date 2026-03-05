"""ActiveCampaign integration service."""

from __future__ import annotations

import json
import logging

import httpx

logger = logging.getLogger(__name__)

AC_API_URL = "https://kairos-ai.api-us1.com"
AC_API_KEY = "a06095378bcf108e76fa0cdcbe6d1a8fe16bfc839bd79030d81585dd29c395eebf9d7752"
AC_EVENT_KEY = "6df0a873538d1d2bc0a44c3e5f0171997ff855e1"
AC_ACTID = "478981417"
AC_INVITE_URL_FIELD_ID = "6"


class ActiveCampaignService:
    """Service for interacting with ActiveCampaign API."""

    def __init__(self) -> None:
        self.api_url = AC_API_URL
        self.headers = {
            "Api-Token": AC_API_KEY,
            "Content-Type": "application/json",
        }

    async def sync_contact(
        self,
        email: str,
        first_name: str | None = None,
        last_name: str | None = None,
        invite_url: str | None = None,
    ) -> dict:
        """Create or update a contact in ActiveCampaign.

        Returns the contact data from AC response.
        """
        contact: dict = {"email": email}
        if first_name:
            contact["firstName"] = first_name
        if last_name:
            contact["lastName"] = last_name

        if invite_url:
            contact["fieldValues"] = [
                {"field": AC_INVITE_URL_FIELD_ID, "value": invite_url}
            ]

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{self.api_url}/api/3/contact/sync",
                headers=self.headers,
                json={"contact": contact},
            )
            response.raise_for_status()
            return response.json()

    async def track_event(self, email: str, event_name: str) -> dict:
        """Track an event for a contact in ActiveCampaign."""
        data = {
            "actid": AC_ACTID,
            "key": AC_EVENT_KEY,
            "event": event_name,
            "visit": json.dumps({"email": email}),
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://trackcmp.net/event",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            return response.json()
