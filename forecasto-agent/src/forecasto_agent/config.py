"""Configuration loader for Forecasto Agent.

Global config: ~/.forecasto-agent/config.toml
Per-folder config: <watched_folder>/.forecasto-agent/config.toml
Per-folder system prompt: <watched_folder>/.forecasto-agent/system-prompt.md
Per-folder user prompt: <watched_folder>/.forecasto-agent/user-prompt.md
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib  # type: ignore[no-reuse-def]

GLOBAL_CONFIG_DIR = Path.home() / ".forecasto-agent"
GLOBAL_CONFIG_FILE = GLOBAL_CONFIG_DIR / "config.toml"
FOLDER_CONFIG_DIR = ".forecasto-agent"

DEFAULT_SYSTEM_PROMPT = """\
You are a financial document processor for Forecasto, an Italian cash-flow management tool.
Extract all financial transactions from the provided document and return structured records.

FIELD DEFINITIONS — read carefully:

- area: one of "actual" (real transactions), "orders" (confirmed orders), "prospect" (expected), "budget"
  Default: "actual" for invoices/receipts, "orders" for purchase orders.

- type: the record type in Forecasto. Use one of: "Fornitori", "Clienti", "Dipendenti",
  "Utenze", "Affitti", "Banche", "Tasse", "Altro". Choose the one that best matches the document.

- account: the COST CATEGORY or account label (e.g. "Consulenze", "Hardware", "Utenze", "Affitti",
  "Personale", "Marketing"). This is NOT the counterpart company name — it is the cost/revenue category.
  Use a short, generic Italian noun that classifies the expense or income.

- reference: the COUNTERPART NAME and/or document identifier, e.g. "Acme SRL — Fattura 123/2026"
  or "Mario Rossi — Parcella marzo 2026". Combine supplier/client name with invoice number.

- transaction_id: document type, number and date in Italian, e.g. "Fattura 1/2026",
  "Nota credito 5/2026", "Parcella 3/2026", "Ricevuta 42/2026".
  Use the full Italian document type name (not abbreviations like FT or FPR).
  Include the year as 4 digits. Do NOT leave this empty.

- date_offer: document/order date as YYYY-MM-DD.

- date_cashflow: expected payment or cash movement date as YYYY-MM-DD.
  Calculate from payment terms if stated (e.g. "30 giorni fine mese", "60 giorni data fattura").
  If not stated, default to date_offer + 30 days.

- amount: net amount excluding VAT. Negative for expenses/costs, positive for income/revenue.

- vat: VAT (IVA) amount. Negative for expenses, positive for income. 0 if not applicable.

- total: amount + vat (must equal amount + vat exactly).

- stage: "0" if not yet paid/invoiced, "1" if already paid/settled.

- note: a concise but informative description of the nature of the supply, service or transaction.
  Include: what was purchased/sold, the scope/purpose if inferable, any relevant conditions
  (e.g. payment terms, project name, period covered). Write in Italian. 2-4 sentences max.
  Do NOT leave this empty — always provide useful context.

- document_type: classify the document as one of:
  "invoice" = fattura emessa o ricevuta
  "quote" = offerta commerciale o preventivo
  "bank_statement" = estratto conto bancario (contiene più transazioni)
  "wire_transfer" = contabile di bonifico o ricevuta di pagamento singola
  "receipt" = ricevuta o scontrino
  "credit_note" = nota di credito
  "other" = altro tipo di documento
  IMPORTANT: for bank_statement and wire_transfer, the 'stage' of each extracted record
  should be "1" (already executed), and 'area' should be "actual".

Return a valid JSON array of records matching this schema. Extract ALL line items or transactions
found in the document. If the document contains a single invoice, return one record.
"""


@dataclass
class ServerConfig:
    base_url: str = "https://app.forecasto.it"
    api_key: str = ""
    agent_token: str = ""


@dataclass
class FolderLLMConfig:
    provider: str = "anthropic"          # anthropic | ollama
    model: str = "claude-sonnet-4-6"
    api_key: str = ""                    # overrides global if set
    ollama_base_url: str = "http://localhost:11434"


@dataclass
class WatchedFolder:
    path: Path
    workspace_id: str
    llm: FolderLLMConfig = field(default_factory=FolderLLMConfig)
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    user_prompt: str = ""
    agent_token: str = ""

    @property
    def config_dir(self) -> Path:
        return self.path / FOLDER_CONFIG_DIR

    @classmethod
    def load(cls, path: Path, workspace_id: str, global_server: ServerConfig, global_agent_token: str = "") -> "WatchedFolder":
        """Load folder-specific config, merging with defaults."""
        config_dir = path / FOLDER_CONFIG_DIR
        llm = FolderLLMConfig()
        per_folder_api_key = global_server.api_key

        config_file = config_dir / "config.toml"
        if config_file.exists():
            with config_file.open("rb") as f:
                data = tomllib.load(f)
            llm_data = data.get("llm", {})
            llm.provider = llm_data.get("provider", llm.provider)
            llm.model = llm_data.get("model", llm.model)
            llm.api_key = llm_data.get("api_key", "")
            llm.ollama_base_url = llm_data.get("ollama_base_url", llm.ollama_base_url)
            ws_data = data.get("workspace", {})
            if ws_id := ws_data.get("id"):
                workspace_id = ws_id
            server_data = data.get("server", {})
            per_folder_api_key = server_data.get("api_key", per_folder_api_key)

        system_prompt = DEFAULT_SYSTEM_PROMPT
        sp_file = config_dir / "system-prompt.md"
        if sp_file.exists():
            system_prompt = sp_file.read_text(encoding="utf-8")

        user_prompt = ""
        up_file = config_dir / "user-prompt.md"
        if up_file.exists():
            user_prompt = up_file.read_text(encoding="utf-8")

        # Prefer agent_token from global config over per-folder api_key
        resolved_agent_token = global_agent_token

        return cls(
            path=path,
            workspace_id=workspace_id,
            llm=llm,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            agent_token=resolved_agent_token,
        )


@dataclass
class AgentConfig:
    server: ServerConfig = field(default_factory=ServerConfig)
    watched_folders: list[WatchedFolder] = field(default_factory=list)
    agent_token: str = ""
    watch_root_path: str = ""

    @classmethod
    def load(cls) -> "AgentConfig":
        """Load global config from ~/.forecasto-agent/config.toml."""
        config = cls()
        if not GLOBAL_CONFIG_FILE.exists():
            return config

        with GLOBAL_CONFIG_FILE.open("rb") as f:
            data = tomllib.load(f)

        server_data = data.get("server", {})
        config.server.base_url = server_data.get("base_url", config.server.base_url)
        config.server.api_key = server_data.get("api_key", "")
        config.server.agent_token = server_data.get("agent_token", "")
        config.agent_token = server_data.get("agent_token", "")

        watch_data = data.get("watch", {})
        config.watch_root_path = watch_data.get("root_path", "")

        for folder_data in data.get("watched_folders", []):
            folder_path = Path(folder_data["path"]).expanduser().resolve()
            workspace_id = folder_data.get("workspace_id", "")
            if not folder_path.is_dir():
                continue
            folder = WatchedFolder.load(folder_path, workspace_id, config.server, config.agent_token)
            config.watched_folders.append(folder)

        return config

    def write_example(self) -> None:
        """Write an example config to ~/.forecasto-agent/config.toml if it doesn't exist."""
        GLOBAL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        if GLOBAL_CONFIG_FILE.exists():
            return
        example = """\
[server]
base_url = "https://app.forecasto.it"
agent_token = "at_your_personal_token_here"

# Root folder — agent creates one subfolder per workspace automatically
[watch]
root_path = "~/Documents/ForecastoInbox"

# OR explicit per-workspace config (legacy mode):
# [[watched_folders]]
# path = "~/Documents/Fatture"
# workspace_id = "your-workspace-id"
"""
        GLOBAL_CONFIG_FILE.write_text(example, encoding="utf-8")
