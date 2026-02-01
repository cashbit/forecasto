"""Project service."""

from __future__ import annotations


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.exceptions import NotFoundException, ValidationException
from forecasto.models.project import Project, ProjectPhase
from forecasto.models.record import Record
from forecasto.models.session import Session
from forecasto.models.user import User
from forecasto.schemas.project import PhaseCreate, ProjectCreate, ProjectUpdate
from forecasto.services.transfer_service import TransferService

class ProjectService:
    """Service for project operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_projects(
        self,
        workspace_id: str,
        status: str | None = None,
        customer_ref: str | None = None,
    ) -> list[Project]:
        """List projects for a workspace."""
        query = (
            select(Project)
            .options(selectinload(Project.phases))
            .where(Project.workspace_id == workspace_id)
        )

        if status:
            query = query.where(Project.status == status)
        if customer_ref:
            query = query.where(Project.customer_ref == customer_ref)

        query = query.order_by(Project.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_project(
        self, workspace_id: str, data: ProjectCreate
    ) -> Project:
        """Create a new project."""
        # Check unique code
        if data.code:
            result = await self.db.execute(
                select(Project).where(
                    Project.workspace_id == workspace_id,
                    Project.code == data.code,
                )
            )
            if result.scalar_one_or_none():
                raise ValidationException(f"Project code '{data.code}' already exists")

        project = Project(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            customer_ref=data.customer_ref,
            code=data.code,
            expected_revenue=data.expected_revenue,
            expected_costs=data.expected_costs,
            expected_margin=data.expected_margin,
            status=data.status,
            start_date=data.start_date,
            end_date=data.end_date,
        )
        self.db.add(project)
        await self.db.flush()

        # Create phases
        if data.phases:
            for phase_data in data.phases:
                phase = ProjectPhase(
                    project_id=project.id,
                    name=phase_data.name,
                    description=phase_data.description,
                    sequence=phase_data.sequence,
                    current_area=phase_data.current_area,
                    expected_start=phase_data.expected_start,
                    expected_end=phase_data.expected_end,
                    expected_revenue=phase_data.expected_revenue,
                    expected_costs=phase_data.expected_costs,
                )
                self.db.add(phase)

        return project

    async def get_project(self, project_id: str, workspace_id: str) -> Project:
        """Get project by ID."""
        result = await self.db.execute(
            select(Project)
            .options(selectinload(Project.phases))
            .where(
                Project.id == project_id,
                Project.workspace_id == workspace_id,
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundException(f"Project {project_id} not found")
        return project

    async def update_project(self, project: Project, data: ProjectUpdate) -> Project:
        """Update a project."""
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(project, key):
                setattr(project, key, value)
        return project

    async def get_phases(self, project_id: str) -> list[ProjectPhase]:
        """Get phases for a project."""
        result = await self.db.execute(
            select(ProjectPhase)
            .where(ProjectPhase.project_id == project_id)
            .order_by(ProjectPhase.sequence)
        )
        return list(result.scalars().all())

    async def create_phase(self, project_id: str, data: PhaseCreate) -> ProjectPhase:
        """Create a new phase."""
        # Check project exists
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        if not result.scalar_one_or_none():
            raise NotFoundException(f"Project {project_id} not found")

        # Check unique sequence
        result = await self.db.execute(
            select(ProjectPhase).where(
                ProjectPhase.project_id == project_id,
                ProjectPhase.sequence == data.sequence,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException(f"Phase with sequence {data.sequence} already exists")

        phase = ProjectPhase(
            project_id=project_id,
            name=data.name,
            description=data.description,
            sequence=data.sequence,
            current_area=data.current_area,
            expected_start=data.expected_start,
            expected_end=data.expected_end,
            expected_revenue=data.expected_revenue,
            expected_costs=data.expected_costs,
        )
        self.db.add(phase)
        return phase

    async def get_phase(self, phase_id: str, project_id: str) -> ProjectPhase:
        """Get phase by ID."""
        result = await self.db.execute(
            select(ProjectPhase).where(
                ProjectPhase.id == phase_id,
                ProjectPhase.project_id == project_id,
            )
        )
        phase = result.scalar_one_or_none()
        if not phase:
            raise NotFoundException(f"Phase {phase_id} not found")
        return phase

    async def transfer_phase(
        self,
        phase: ProjectPhase,
        to_area: str,
        user: User,
        session: Session,
        note: str | None = None,
    ) -> list[Record]:
        """Transfer all records in a phase to a new area."""
        transfer_service = TransferService(self.db)

        # Get all records for this phase
        result = await self.db.execute(
            select(Record).where(
                Record.phase_id == phase.id,
                Record.deleted_at.is_(None),
            )
        )
        records = list(result.scalars().all())

        transferred = []
        for record in records:
            if record.area != to_area:
                await transfer_service.transfer_record(
                    record=record,
                    to_area=to_area,
                    user=user,
                    session=session,
                    note=note or f"Phase '{phase.name}' transferred to {to_area}",
                )
                transferred.append(record)

        # Update phase current_area
        phase.current_area = to_area

        return transferred
