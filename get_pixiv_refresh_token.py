import json
import re
import time
from argparse import ArgumentParser
from base64 import urlsafe_b64encode
from hashlib import sha256
from secrets import token_urlsafe
from urllib.parse import urlencode

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

USER_AGENT = "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)"
REDIRECT_URI = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback"
LOGIN_URL = "https://app-api.pixiv.net/web/v1/login"
AUTH_TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token"
CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT"
CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj"

def s256(data):
    return urlsafe_b64encode(sha256(data).digest()).rstrip(b"=").decode("ascii")

def oauth_pkce():
    verifier = token_urlsafe(32)
    challenge = s256(verifier.encode("ascii"))
    return verifier, challenge

def login():
    options = webdriver.ChromeOptions()
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

    code_verifier, code_challenge = oauth_pkce()
    params = {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "client": "pixiv-android",
    }

    driver.get(f"{LOGIN_URL}?{urlencode(params)}")
    code = None

    while True:
        time.sleep(1)
        for row in driver.get_log("performance"):
            msg = json.loads(row["message"]).get("message", {})
            if msg.get("method") == "Network.requestWillBeSent":
                url = msg.get("params", {}).get("documentURL", "")
                if url.startswith("pixiv://"):
                    m = re.search(r"code=([^&]*)", url)
                    if m:
                        code = m.group(1)
                        break
        if code:
            break

    driver.quit()
    print("[INFO] code:", code)

    resp = requests.post(
        AUTH_TOKEN_URL,
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "include_policy": "true",
            "redirect_uri": REDIRECT_URI,
        },
        headers={
            "user-agent": USER_AGENT,
            "app-os-version": "14.6",
            "app-os": "ios",
        },
        timeout=30,
    ).json()

    print("refresh_token:", resp.get("refresh_token"))
    print("access_token:", resp.get("access_token"))

if __name__ == "__main__":
    login()
