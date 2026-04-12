"""Prompt builder service — analyze record patterns and generate LLM prompts."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from decimal import Decimal

import anthropic
from sqlalchemy import func, select, case, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.prompt_generation import PromptGenerationJob
from forecasto.models.record import Record
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember

logger = logging.getLogger(__name__)

# Haiku pricing (USD per MTok) — converted to EUR at ~0.92
HAIKU_INPUT_PRICE_EUR = 0.80 * 0.92 / 1_000_000  # per token
HAIKU_OUTPUT_PRICE_EUR = 4.00 * 0.92 / 1_000_000  # per token
DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class PromptBuilderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_workspace_patterns(self, workspace_id: str) -> dict:
        """Extract patterns from records via SQL aggregation (zero LLM cost)."""
        base = select(Record).where(
            Record.workspace_id == workspace_id,
            Record.deleted_at.is_(None),
        )

        # 1. Total records count
        count_result = await self.db.execute(
            select(func.count(Record.id)).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            )
        )
        total_records = count_result.scalar() or 0

        # 2. Account frequency with in/out count
        account_q = await self.db.execute(
            select(
                Record.account,
                func.count().label("total"),
                func.sum(case((Record.amount >= 0, 1), else_=0)).label("in_count"),
                func.sum(case((Record.amount < 0, 1), else_=0)).label("out_count"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            ).group_by(Record.account).order_by(func.count().desc()).limit(30)
        )
        account_frequency = [
            {"account": r[0], "total": r[1], "in_count": r[2], "out_count": r[3]}
            for r in account_q.all()
        ]

        # 3. Reference → Account mapping (top 100)
        ref_acc_q = await self.db.execute(
            select(
                Record.reference,
                Record.account,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            ).group_by(Record.reference, Record.account)
            .order_by(func.count().desc()).limit(100)
        )
        reference_account_mapping = [
            {"reference": r[0], "account": r[1], "count": r[2]}
            for r in ref_acc_q.all()
        ]

        # 4. Reference → Total patterns (avg/min/max total by reference)
        ref_total_q = await self.db.execute(
            select(
                Record.reference,
                func.count().label("cnt"),
                func.avg(func.abs(Record.total)).label("avg_total"),
                func.min(func.abs(Record.total)).label("min_total"),
                func.max(func.abs(Record.total)).label("max_total"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            ).group_by(Record.reference)
            .having(func.count() >= 2)
            .order_by(func.count().desc()).limit(50)
        )
        reference_total_patterns = [
            {
                "reference": r[0], "count": r[1],
                "avg_total": round(float(r[2] or 0), 2),
                "min_total": round(float(r[3] or 0), 2),
                "max_total": round(float(r[4] or 0), 2),
            }
            for r in ref_total_q.all()
        ]

        # 5. Type → Area mapping
        type_area_q = await self.db.execute(
            select(
                Record.type,
                Record.area,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            ).group_by(Record.type, Record.area)
            .order_by(func.count().desc()).limit(30)
        )
        type_area_mapping = [
            {"type": r[0], "area": r[1], "count": r[2]}
            for r in type_area_q.all()
        ]

        # 6. VAT deduction specials (where != 100)
        vat_ded_q = await self.db.execute(
            select(
                Record.account,
                Record.vat_deduction,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
                Record.vat_deduction != Decimal("100"),
                Record.vat_deduction.isnot(None),
            ).group_by(Record.account, Record.vat_deduction)
            .order_by(func.count().desc()).limit(20)
        )
        vat_deduction_patterns = [
            {"account": r[0], "vat_deduction": float(r[1]), "count": r[2]}
            for r in vat_ded_q.all()
        ]

        # 7. Withholding rate patterns
        wh_q = await self.db.execute(
            select(
                Record.type,
                Record.account,
                Record.withholding_rate,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
                Record.withholding_rate.isnot(None),
            ).group_by(Record.type, Record.account, Record.withholding_rate)
            .order_by(func.count().desc()).limit(20)
        )
        withholding_patterns = [
            {"type": r[0], "account": r[1], "withholding_rate": float(r[2]), "count": r[3]}
            for r in wh_q.all()
        ]

        # 8. Project code → Account mapping
        proj_q = await self.db.execute(
            select(
                Record.project_code,
                Record.account,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
                Record.project_code.isnot(None),
                Record.project_code != "",
            ).group_by(Record.project_code, Record.account)
            .order_by(func.count().desc()).limit(30)
        )
        project_account_mapping = [
            {"project_code": r[0], "account": r[1], "count": r[2]}
            for r in proj_q.all()
        ]

        # 9. Stage patterns by reference
        stage_q = await self.db.execute(
            select(
                Record.reference,
                Record.stage,
                func.count().label("cnt"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
            ).group_by(Record.reference, Record.stage)
            .having(func.count() >= 2)
            .order_by(func.count().desc()).limit(50)
        )
        stage_patterns = [
            {"reference": r[0], "stage": r[1], "count": r[2]}
            for r in stage_q.all()
        ]

        # 10. Payment terms (avg days from date_document to date_cashflow)
        # Only where date_document is NOT NULL
        # SQLite: julianday(date_cashflow) - julianday(date_document)
        payment_terms_q = await self.db.execute(
            select(
                Record.reference,
                func.count().label("cnt"),
                func.avg(
                    func.julianday(Record.date_cashflow) - func.julianday(Record.date_document)
                ).label("avg_days"),
            ).where(
                Record.workspace_id == workspace_id,
                Record.deleted_at.is_(None),
                Record.date_document.isnot(None),
            ).group_by(Record.reference)
            .having(func.count() >= 2)
            .order_by(func.count().desc()).limit(30)
        )
        payment_terms = [
            {"reference": r[0], "count": r[1], "avg_days": round(float(r[2] or 0))}
            for r in payment_terms_q.all()
        ]

        return {
            "total_records": total_records,
            "account_frequency": account_frequency,
            "reference_account_mapping": reference_account_mapping,
            "reference_total_patterns": reference_total_patterns,
            "type_area_mapping": type_area_mapping,
            "vat_deduction_patterns": vat_deduction_patterns,
            "withholding_patterns": withholding_patterns,
            "project_account_mapping": project_account_mapping,
            "stage_patterns": stage_patterns,
            "payment_terms": payment_terms,
        }

    async def generate_workspace_prompt(
        self,
        workspace_id: str,
        user_id: str,
        existing_prompt: str | None = None,
    ) -> tuple[str, dict, int]:
        """Generate/update a workspace prompt from patterns. Returns (prompt, usage, records_count)."""
        patterns = await self.analyze_workspace_patterns(workspace_id)

        if patterns["total_records"] < 10:
            raise ValueError(
                f"Dati insufficienti: solo {patterns['total_records']} record. "
                "Servono almeno 10 record per generare un prompt."
            )

        # Build compact JSON for LLM
        patterns_json = json.dumps(patterns, ensure_ascii=False, default=str)

        system_msg = (
            "Sei un prompt engineer per Forecasto, un tool italiano di gestione cashflow. "
            "Genera un prompt strutturato in markdown che guiderà un agente AI nella classificazione "
            "di documenti finanziari (fatture, estratti conto, contabili di bonifico). "
            "Il prompt deve essere in italiano e contenere regole specifiche basate sui pattern forniti."
        )

        user_msg = f"""Analizza questi pattern estratti dai record finanziari di un workspace Forecasto e genera un prompt strutturato.

## Pattern estratti:
{patterns_json}

## Istruzioni:
Genera un prompt markdown con queste sezioni:

### Mappature Account
Per ogni fornitore/cliente ricorrente, indica quale account (categoria costo/ricavo) usare.
Formato: "Quando il riferimento è [X], usa account=[Y], type=[Z]"

### Regole IVA
Indica le deduzioni IVA non standard. Es: "Per account [X], usa vat_deduction=[N]%"

### Regole Ritenuta d'Acconto
Se presenti pattern di ritenuta, indicali. Es: "Per type [X], withholding_rate=[N]%"

### Project Code
Associazioni tipiche tra riferimenti/account e project code.

### Termini di Pagamento
Per ogni fornitore/cliente con dati sufficienti, indica i giorni medi di pagamento.
Formato: "Per [X], il termine medio è ~[N] giorni dalla data documento. Calcola date_cashflow = date_document + [N] giorni"

### Riconciliazione Pagamenti
Per estratti conto e contabili di bonifico: indica importi tipici per riferimento, per agevolare il matching.
Formato: "Per [X], importi tipici: €[min]-€[max], media €[avg]"

### Pattern Speciali
Eventuali eccezioni o regole particolari desunte dai dati.

{f'## Prompt esistente da AGGIORNARE (integra i nuovi pattern, preserva blocchi <!-- MANUAL -->):' + chr(10) + existing_prompt if existing_prompt else ''}

IMPORTANTE: Sii conciso ma completo. Non includere record o dati di esempio, solo regole operative."""

        prompt_text, usage = await self._call_llm(system_msg, user_msg)
        return prompt_text, usage, patterns["total_records"]

    async def generate_user_prompt(
        self,
        user_id: str,
        existing_prompt: str | None = None,
    ) -> tuple[str, dict, int]:
        """Generate/update a user-level prompt from all owned workspaces."""
        # Find all workspaces where user is owner or admin
        result = await self.db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.role.in_(["owner", "admin"]),
            )
        )
        workspace_ids = [r[0] for r in result.all()]

        if not workspace_ids:
            raise ValueError("Nessun workspace trovato dove sei owner o admin.")

        # Aggregate patterns across workspaces
        all_patterns = []
        total_records = 0
        for ws_id in workspace_ids:
            p = await self.analyze_workspace_patterns(ws_id)
            total_records += p["total_records"]
            all_patterns.append(p)

        if total_records < 10:
            raise ValueError(
                f"Dati insufficienti: solo {total_records} record totali. "
                "Servono almeno 10 record per generare un prompt."
            )

        # Merge patterns — find commonalities
        merged = json.dumps(
            {"workspace_count": len(workspace_ids), "total_records": total_records, "workspaces": all_patterns},
            ensure_ascii=False, default=str,
        )

        system_msg = (
            "Sei un prompt engineer per Forecasto. Genera un prompt utente di livello generale "
            "che catturi lo stile comune di inserimento dati di questo utente attraverso tutti i suoi workspace. "
            "NON includere dettagli specifici dei singoli workspace (quelli vanno nel prompt workspace). "
            "Concentrati su pattern generali: come l'utente nomina le categorie, convenzioni di naming, "
            "livello di dettaglio nelle note, preferenze di classificazione."
        )

        user_msg = f"""Analizza i pattern aggregati da {len(workspace_ids)} workspace e genera un prompt utente generale.

## Pattern aggregati:
{merged}

## Istruzioni:
Genera un prompt markdown conciso con:
- Convenzioni generali di naming (account, reference)
- Stile delle note (dettagliate vs sintetiche)
- Preferenze di classificazione type/area
- Regole generali IVA/ritenuta comuni a tutti i workspace

{f'## Prompt esistente da AGGIORNARE:' + chr(10) + existing_prompt if existing_prompt else ''}

Sii conciso (max 500 parole). Solo regole operative, no esempi."""

        prompt_text, usage = await self._call_llm(system_msg, user_msg)
        return prompt_text, usage, total_records

    async def _call_llm(self, system_msg: str, user_msg: str) -> tuple[str, dict]:
        """Call Claude Haiku and return (text, usage_dict)."""
        from forecasto.config import settings
        client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        )

        response = await client.messages.create(
            model=DEFAULT_MODEL,
            max_tokens=4096,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )

        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text

        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "model": DEFAULT_MODEL,
        }

        return text, usage

    async def save_workspace_prompt(self, workspace_id: str, prompt_text: str) -> None:
        """Save prompt to workspace.settings['agent_prompt']."""
        workspace = await self.db.get(Workspace, workspace_id)
        if not workspace:
            raise ValueError(f"Workspace {workspace_id} not found")
        settings = dict(workspace.settings) if workspace.settings else {}
        settings["agent_prompt"] = prompt_text
        workspace.settings = settings
        await self.db.flush()

    async def save_user_prompt(self, user_id: str, prompt_text: str) -> None:
        """Save prompt to user.agent_prompt."""
        user = await self.db.get(User, user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        user.agent_prompt = prompt_text
        await self.db.flush()

    async def track_generation(
        self,
        user_id: str,
        workspace_id: str | None,
        scope: str,
        usage: dict,
        prompt_text: str,
        status: str,
        records_analyzed: int,
        error_message: str | None = None,
    ) -> PromptGenerationJob:
        """Create a PromptGenerationJob record for billing/audit."""
        cost = (
            usage.get("input_tokens", 0) * HAIKU_INPUT_PRICE_EUR
            + usage.get("output_tokens", 0) * HAIKU_OUTPUT_PRICE_EUR
        )

        job = PromptGenerationJob(
            user_id=user_id,
            workspace_id=workspace_id,
            scope=scope,
            status=status,
            llm_model=usage.get("model", DEFAULT_MODEL),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            total_cost_eur=round(cost, 6),
            prompt_text=prompt_text,
            error_message=error_message,
            billing_month=datetime.utcnow().strftime("%Y-%m"),
            records_analyzed=records_analyzed,
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow() if status == "completed" else None,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def get_generation_history(
        self,
        workspace_id: str,
        limit: int = 20,
    ) -> list[PromptGenerationJob]:
        """Get prompt generation history for a workspace."""
        result = await self.db.execute(
            select(PromptGenerationJob).where(
                PromptGenerationJob.workspace_id == workspace_id,
            ).order_by(PromptGenerationJob.created_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def get_usage_summary(self, user_id: str) -> list[dict]:
        """Get aggregated usage per billing month."""
        result = await self.db.execute(
            select(
                PromptGenerationJob.billing_month,
                func.sum(PromptGenerationJob.input_tokens).label("total_input"),
                func.sum(PromptGenerationJob.output_tokens).label("total_output"),
                func.sum(PromptGenerationJob.total_cost_eur).label("total_cost"),
                func.count().label("gen_count"),
            ).where(
                PromptGenerationJob.user_id == user_id,
            ).group_by(PromptGenerationJob.billing_month)
            .order_by(PromptGenerationJob.billing_month.desc()).limit(12)
        )
        return [
            {
                "month": r[0],
                "total_input_tokens": r[1] or 0,
                "total_output_tokens": r[2] or 0,
                "total_cost_eur": round(float(r[3] or 0), 4),
                "generation_count": r[4] or 0,
            }
            for r in result.all()
        ]
