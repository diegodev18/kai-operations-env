import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrgUser } from "@/components/shared";
import { fetchOrganizationMe, fetchOrganizationUsers } from "@/services/organization-api";
import {
  type AgentGrowerRow,
  type AgentTechLeadRow,
  deleteAgentGrower,
  deleteAgentTechLead,
  fetchAgentGrowers,
  fetchAgentTechLeads,
  postAgentGrower,
  postAgentTechLead,
} from "@/services/agents-api";

type AssignResult = { ok: true } | { ok: false; error: string };

export function useConfigurationEditorTeamManagement({
  agentId,
  isGrowersDialogOpen,
  isTechLeadsDialogOpen,
}: {
  agentId: string;
  isGrowersDialogOpen: boolean;
  isTechLeadsDialogOpen: boolean;
}) {
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [dialogGrowers, setDialogGrowers] = useState<AgentGrowerRow[]>([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [dialogGrowersLoading, setDialogGrowersLoading] = useState(false);
  const [addingGrowerUserId, setAddingGrowerUserId] = useState<string | null>(null);
  const [isTechLeadsLoading, setIsTechLeadsLoading] = useState(false);
  const [addingTechLeadUserId, setAddingTechLeadUserId] = useState<string | null>(null);
  const [dialogTechLeads, setDialogTechLeads] = useState<AgentTechLeadRow[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    void (async () => {
      const [me, growersRes, techLeadsRes] = await Promise.all([
        fetchOrganizationMe(),
        fetchAgentGrowers(agentId),
        fetchAgentTechLeads(agentId),
      ]);
      if (cancelled) return;
      if (me) {
        setUserRole(me.role);
        setUserEmail(me.email ?? null);
      }
      if (growersRes?.growers) {
        setDialogGrowers(growersRes.growers);
      }
      if (techLeadsRes?.techLeads) {
        setDialogTechLeads(techLeadsRes.techLeads);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!isGrowersDialogOpen || !agentId) {
      if (!isGrowersDialogOpen) {
        setOrgUsers([]);
        setDialogGrowers([]);
      }
      return;
    }

    let cancelled = false;
    setOrgUsersLoading(true);
    setDialogGrowersLoading(true);
    setLoadError(null);
    void (async () => {
      const [usersRes, growersRes] = await Promise.all([
        fetchOrganizationUsers(),
        fetchAgentGrowers(agentId),
      ]);
      if (cancelled) return;

      setOrgUsersLoading(false);
      setDialogGrowersLoading(false);

      if (usersRes?.users) {
        setOrgUsers(usersRes.users);
      } else {
        setOrgUsers([]);
        setLoadError("No se pudieron cargar los usuarios de la organización");
      }

      if (growersRes === null) {
        setDialogGrowers([]);
        setLoadError("No se pudieron cargar los growers del agente");
      } else {
        setDialogGrowers(Array.isArray(growersRes.growers) ? growersRes.growers : []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGrowersDialogOpen, agentId]);

  useEffect(() => {
    if (!isTechLeadsDialogOpen || !agentId) {
      if (!isTechLeadsDialogOpen) {
        setDialogTechLeads([]);
        setOrgUsers([]);
      }
      return;
    }

    let cancelled = false;
    setIsTechLeadsLoading(true);
    setOrgUsersLoading(true);
    setLoadError(null);
    void (async () => {
      const [usersRes, techLeadsRes] = await Promise.all([
        fetchOrganizationUsers(),
        fetchAgentTechLeads(agentId),
      ]);
      if (cancelled) return;

      setIsTechLeadsLoading(false);
      setOrgUsersLoading(false);

      if (usersRes?.users) {
        setOrgUsers(usersRes.users);
      } else {
        setOrgUsers([]);
        setLoadError("No se pudieron cargar los usuarios de la organización");
      }

      if (techLeadsRes === null) {
        setDialogTechLeads([]);
        setLoadError("No se pudieron cargar los tech leads del agente");
      } else {
        setDialogTechLeads(Array.isArray(techLeadsRes.techLeads) ? techLeadsRes.techLeads : []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTechLeadsDialogOpen, agentId]);

  const growersByEmail = useMemo(() => {
    const byEmail = new Map<string, AgentGrowerRow>();
    for (const g of dialogGrowers) {
      const email = g.email.trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: g.name });
    }
    return byEmail;
  }, [dialogGrowers]);

  const techLeadsByEmail = useMemo(() => {
    const byEmail = new Map<string, AgentTechLeadRow>();
    for (const tl of dialogTechLeads) {
      const email = tl.email.trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: tl.name });
    }
    return byEmail;
  }, [dialogTechLeads]);

  const checkIsGrower = useCallback(
    (u: OrgUser) => {
      const email = u.email.trim().toLowerCase();
      if (growersByEmail.has(email)) return true;
      const name = (u.name ?? "").trim().toLowerCase();
      if (!name) return false;
      for (const g of growersByEmail.values()) {
        if (g.name.trim().toLowerCase() === name) return true;
      }
      return false;
    },
    [growersByEmail],
  );

  const checkIsTechLead = useCallback(
    (u: OrgUser) => {
      const email = u.email.trim().toLowerCase();
      if (techLeadsByEmail.has(email)) return true;
      const name = (u.name ?? "").trim().toLowerCase();
      if (!name) return false;
      for (const tl of techLeadsByEmail.values()) {
        if (tl.name.trim().toLowerCase() === name) return true;
      }
      return false;
    },
    [techLeadsByEmail],
  );

  const addGrower = useCallback(
    async (orgUser: OrgUser): Promise<AssignResult> => {
      if (!agentId || checkIsGrower(orgUser)) return { ok: true };
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingGrowerUserId(orgUser.id);
      try {
        const displayName = (orgUser.name ?? "").trim() || orgUser.email.trim();
        const result = await postAgentGrower(agentId, {
          email: orgUser.email.trim(),
          name: displayName,
        });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        const row: AgentGrowerRow = { email: emailNorm, name: displayName };
        setDialogGrowers((prev) =>
          prev.some((g) => g.email.trim().toLowerCase() === emailNorm) ? prev : [...prev, row],
        );
        return { ok: true };
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [agentId, checkIsGrower],
  );

  const removeGrower = useCallback(
    async (orgUser: OrgUser): Promise<AssignResult> => {
      if (!agentId || !checkIsGrower(orgUser)) return { ok: true };
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingGrowerUserId(orgUser.id);
      try {
        const result = await deleteAgentGrower(agentId, orgUser.email);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        setDialogGrowers((prev) =>
          prev.filter((g) => g.email.trim().toLowerCase() !== emailNorm),
        );
        return { ok: true };
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [agentId, checkIsGrower],
  );

  const addTechLead = useCallback(
    async (orgUser: OrgUser): Promise<AssignResult> => {
      if (!agentId || checkIsTechLead(orgUser)) return { ok: true };
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingTechLeadUserId(orgUser.id);
      try {
        const displayName = (orgUser.name ?? "").trim() || orgUser.email.trim();
        const result = await postAgentTechLead(agentId, {
          email: orgUser.email.trim(),
          name: displayName,
        });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        const row: AgentTechLeadRow = { email: emailNorm, name: displayName };
        setDialogTechLeads((prev) =>
          prev.some((tl) => tl.email.trim().toLowerCase() === emailNorm) ? prev : [...prev, row],
        );
        return { ok: true };
      } finally {
        setAddingTechLeadUserId(null);
      }
    },
    [agentId, checkIsTechLead],
  );

  const removeTechLead = useCallback(
    async (orgUser: OrgUser): Promise<AssignResult> => {
      if (!agentId || !checkIsTechLead(orgUser)) return { ok: true };
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingTechLeadUserId(orgUser.id);
      try {
        const result = await deleteAgentTechLead(agentId, orgUser.email);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        setDialogTechLeads((prev) =>
          prev.filter((tl) => tl.email.trim().toLowerCase() !== emailNorm),
        );
        return { ok: true };
      } finally {
        setAddingTechLeadUserId(null);
      }
    },
    [agentId, checkIsTechLead],
  );

  const sortedOrgUsers = useMemo(
    () => [...orgUsers].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
    [orgUsers],
  );

  const growerPickerLoading = orgUsersLoading || dialogGrowersLoading;

  return {
    userRole,
    userEmail,
    loadError,
    setLoadError,
    dialogGrowers,
    dialogTechLeads,
    sortedOrgUsers,
    growerPickerLoading,
    isTechLeadsLoading,
    addingGrowerUserId,
    addingTechLeadUserId,
    checkIsGrower,
    checkIsTechLead,
    addGrower,
    removeGrower,
    addTechLead,
    removeTechLead,
    setAddingGrowerUserId,
    setAddingTechLeadUserId,
  };
}
