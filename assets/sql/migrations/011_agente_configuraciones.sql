-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 011: Tabla agente_configuraciones
-- Preferencias por agente persistidas en BD
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agente_configuraciones (
  agente_id              UUID     PRIMARY KEY REFERENCES agentes(id) ON DELETE CASCADE,
  -- Módulo Tareas
  estados_default        TEXT[]   DEFAULT ARRAY['nuevo','en_progreso','en_revision'],
  tipo_tareas_default    TEXT[]   DEFAULT ARRAY['puntual','cronologica'],
  filtro_agentes_modo    TEXT     DEFAULT 'solo_yo',   -- 'solo_yo' | 'todos'
  -- Módulo Proyectos
  vista_proyectos        TEXT     DEFAULT 'lista',      -- 'lista' | 'kanban'
  -- Notificaciones
  notificaciones_activas BOOLEAN  DEFAULT true,
  -- Metadata
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agente_configuraciones ENABLE ROW LEVEL SECURITY;

-- Cada agente solo puede ver y modificar su propia configuración
CREATE POLICY "config_select" ON agente_configuraciones
  FOR SELECT USING (agente_id::text = auth.uid()::text);

CREATE POLICY "config_insert" ON agente_configuraciones
  FOR INSERT WITH CHECK (agente_id::text = auth.uid()::text);

CREATE POLICY "config_update" ON agente_configuraciones
  FOR UPDATE USING (agente_id::text = auth.uid()::text);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_config_updated_at ON agente_configuraciones;
CREATE TRIGGER trg_config_updated_at
  BEFORE UPDATE ON agente_configuraciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Verificación
SELECT 'OK: agente_configuraciones creada' AS resultado;
