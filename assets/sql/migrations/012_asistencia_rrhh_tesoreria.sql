-- ============================================================================
-- MIGRACIÓN 012: Módulos Asistencia · RRHH · Tesorería
-- ZV Task Manager — Sistema Multiempresa
-- Ejecutar en Supabase SQL Editor (proyecto correcto)
-- ============================================================================

-- ============================================================================
-- A. ENUMS NUEVOS
-- ============================================================================

CREATE TYPE tipo_marcacion AS ENUM (
  'inicio_labores',
  'salida_almuerzo',
  'regreso_almuerzo',
  'break_inicio',
  'break_fin',
  'salida_labores'
);

CREATE TYPE tipo_regimen_pension AS ENUM ('AFP', 'ONP', 'ninguno');
CREATE TYPE frecuencia_pago       AS ENUM ('mensual', 'quincenal');
CREATE TYPE estado_planilla       AS ENUM ('borrador', 'cerrado', 'exportado');
CREATE TYPE tipo_mov_rrhh         AS ENUM ('adelanto', 'vale', 'descuento', 'bono');
CREATE TYPE estado_certificado    AS ENUM ('pendiente', 'aprobado', 'rechazado');
CREATE TYPE tipo_mov_caja         AS ENUM ('ingreso', 'egreso', 'transferencia');
CREATE TYPE moneda_caja           AS ENUM ('PEN', 'USD');
CREATE TYPE estado_factura_caja   AS ENUM ('pendiente', 'reembolsada', 'cancelada');

-- ============================================================================
-- B. MÓDULO: ASISTENCIA
-- ============================================================================

-- Configuración de asistencia por empresa
CREATE TABLE config_asistencia (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  breaks_limite   integer     NULL,           -- NULL = sin límite
  hora_salida_default time    NOT NULL DEFAULT '18:00',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

CREATE TRIGGER trg_config_asistencia_updated_at
  BEFORE UPDATE ON config_asistencia
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Marcaciones de asistencia (una fila por evento)
CREATE TABLE marcaciones_asistencia (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id        uuid          NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id       uuid          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo             tipo_marcacion NOT NULL,
  fecha            date          NOT NULL DEFAULT CURRENT_DATE,
  hora             time          NOT NULL,
  timestamp_exacto timestamptz   NOT NULL DEFAULT now(),
  lat              decimal(10,7),
  lng              decimal(10,7),
  retroactivo      boolean       NOT NULL DEFAULT false,
  nota             text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_marcaciones_updated_at
  BEFORE UPDATE ON marcaciones_asistencia
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_marcaciones_agente_fecha ON marcaciones_asistencia(agente_id, fecha);
CREATE INDEX idx_marcaciones_empresa_fecha ON marcaciones_asistencia(empresa_id, fecha);

-- Audit log de ediciones/eliminaciones de marcaciones
CREATE TABLE historial_asistencia (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  marcacion_id      uuid        NOT NULL REFERENCES marcaciones_asistencia(id) ON DELETE CASCADE,
  agente_editor_id  uuid        REFERENCES agentes(id) ON DELETE SET NULL,
  campo_modificado  text        NOT NULL,
  valor_antiguo     text,
  valor_nuevo       text,
  motivo            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_asistencia_marcacion ON historial_asistencia(marcacion_id);

-- Trigger audit automático en UPDATE
CREATE OR REPLACE FUNCTION registrar_historial_marcacion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.hora IS DISTINCT FROM NEW.hora THEN
    INSERT INTO historial_asistencia (marcacion_id, campo_modificado, valor_antiguo, valor_nuevo)
    VALUES (NEW.id, 'hora', OLD.hora::text, NEW.hora::text);
  END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    INSERT INTO historial_asistencia (marcacion_id, campo_modificado, valor_antiguo, valor_nuevo)
    VALUES (NEW.id, 'tipo', OLD.tipo::text, NEW.tipo::text);
  END IF;
  IF OLD.retroactivo IS DISTINCT FROM NEW.retroactivo THEN
    INSERT INTO historial_asistencia (marcacion_id, campo_modificado, valor_antiguo, valor_nuevo)
    VALUES (NEW.id, 'retroactivo', OLD.retroactivo::text, NEW.retroactivo::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_marcaciones_historial
  AFTER UPDATE ON marcaciones_asistencia
  FOR EACH ROW EXECUTE FUNCTION registrar_historial_marcacion();

-- ============================================================================
-- C. MÓDULO: RRHH
-- ============================================================================

-- Contratos de empleados en planilla
CREATE TABLE contratos_empleado (
  id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id           uuid                NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id          uuid                NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sueldo_base         decimal(10,2)       NOT NULL,
  moneda              text                NOT NULL DEFAULT 'PEN',
  frecuencia_pago     frecuencia_pago     NOT NULL DEFAULT 'mensual',
  regimen_pension     tipo_regimen_pension NOT NULL DEFAULT 'AFP',
  porcentaje_pension  decimal(5,2)        DEFAULT 10.00,
  tiene_cts           boolean             NOT NULL DEFAULT true,
  tiene_gratificacion boolean             NOT NULL DEFAULT true,
  tiene_vacaciones    boolean             NOT NULL DEFAULT true,
  tiene_essalud       boolean             NOT NULL DEFAULT true,
  fecha_ingreso       date                NOT NULL,
  fecha_cese          date,
  activo              boolean             NOT NULL DEFAULT true,
  created_at          timestamptz         NOT NULL DEFAULT now(),
  updated_at          timestamptz         NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_contratos_updated_at
  BEFORE UPDATE ON contratos_empleado
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_contratos_agente ON contratos_empleado(agente_id);
CREATE INDEX idx_contratos_empresa ON contratos_empleado(empresa_id);

-- Períodos de planilla (quincenal o mensual por empresa)
CREATE TABLE planilla_periodos (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid            NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_inicio  date            NOT NULL,
  periodo_fin     date            NOT NULL,
  frecuencia      frecuencia_pago NOT NULL,
  estado          estado_planilla NOT NULL DEFAULT 'borrador',
  generado_por    uuid            REFERENCES agentes(id) ON DELETE SET NULL,
  exportado_en    timestamptz,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_planilla_periodos_updated_at
  BEFORE UPDATE ON planilla_periodos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_planilla_periodos_empresa ON planilla_periodos(empresa_id);

-- Ítems de planilla: una fila por agente x período
-- Descuentos de adelantos/vales son INTERNOS (no van al PDT PLAME)
CREATE TABLE planilla_items (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id              uuid        NOT NULL REFERENCES planilla_periodos(id) ON DELETE CASCADE,
  agente_id               uuid        NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id              uuid        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Ingresos
  sueldo_base             decimal(10,2) NOT NULL,
  dias_trabajados         integer       NOT NULL DEFAULT 30,
  horas_extra             decimal(6,2)  NOT NULL DEFAULT 0,
  monto_horas_extra       decimal(10,2) NOT NULL DEFAULT 0,
  bonos                   decimal(10,2) NOT NULL DEFAULT 0,
  sueldo_bruto            decimal(10,2) NOT NULL,  -- base + HE + bonos

  -- Descuentos legales (van al PDT PLAME)
  descuento_pension       decimal(10,2) NOT NULL DEFAULT 0,  -- AFP o ONP
  sueldo_neto_legal       decimal(10,2) NOT NULL,            -- bruto - pension

  -- Descuentos INTERNOS (NO van a SUNAT — solo para uso de la empresa)
  descuento_adelantos     decimal(10,2) NOT NULL DEFAULT 0,
  descuento_vales         decimal(10,2) NOT NULL DEFAULT 0,
  sueldo_neto_pago        decimal(10,2) NOT NULL,            -- neto_legal - internos

  -- Aportes del empleador (para PDT PLAME, no se descuentan del trabajador)
  essalud                 decimal(10,2) NOT NULL DEFAULT 0,  -- 9% bruto

  -- Provisiones del período (acumuladas para referencia)
  cts_provision           decimal(10,2) NOT NULL DEFAULT 0,
  gratificacion_provision decimal(10,2) NOT NULL DEFAULT 0,
  vacaciones_provision    decimal(10,2) NOT NULL DEFAULT 0,

  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (periodo_id, agente_id)
);

CREATE TRIGGER trg_planilla_items_updated_at
  BEFORE UPDATE ON planilla_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_planilla_items_periodo ON planilla_items(periodo_id);
CREATE INDEX idx_planilla_items_agente ON planilla_items(agente_id);

-- Movimientos internos: adelantos, vales, descuentos, bonos
CREATE TABLE movimientos_rrhh (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id             uuid          NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id            uuid          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo                  tipo_mov_rrhh NOT NULL,
  monto                 decimal(10,2) NOT NULL,
  moneda                text          NOT NULL DEFAULT 'PEN',
  descripcion           text,
  fecha                 date          NOT NULL DEFAULT CURRENT_DATE,
  descontado_en_periodo uuid          REFERENCES planilla_periodos(id) ON DELETE SET NULL,
  registrado_por        uuid          REFERENCES agentes(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_mov_rrhh_agente ON movimientos_rrhh(agente_id);
CREATE INDEX idx_mov_rrhh_periodo ON movimientos_rrhh(descontado_en_periodo);

-- Certificados médicos (justifican ausencias)
CREATE TABLE certificados_medicos (
  id            uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id     uuid                NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id    uuid                NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha_inicio  date                NOT NULL,
  fecha_fin     date                NOT NULL,
  diagnostico   text,
  archivo_url   text,
  estado        estado_certificado  NOT NULL DEFAULT 'pendiente',
  aprobado_por  uuid                REFERENCES agentes(id) ON DELETE SET NULL,
  aprobado_en   timestamptz,
  created_at    timestamptz         NOT NULL DEFAULT now(),
  updated_at    timestamptz         NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cert_medicos_updated_at
  BEFORE UPDATE ON certificados_medicos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_cert_medicos_agente ON certificados_medicos(agente_id);

-- Externos RH (contratistas que emiten recibos de honorarios, sin acceso al sistema)
CREATE TABLE externos_rh (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL,
  ruc        text,
  dni        text,
  email      text,
  telefono   text,
  activo     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_externos_rh_updated_at
  BEFORE UPDATE ON externos_rh
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Recibos de honorarios (un externo puede facturar a múltiples empresas)
CREATE TABLE recibos_honorarios (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  externo_id    uuid        NOT NULL REFERENCES externos_rh(id) ON DELETE CASCADE,
  empresa_id    uuid        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  monto         decimal(10,2) NOT NULL,
  moneda        text        NOT NULL DEFAULT 'PEN',
  concepto      text        NOT NULL,
  numero_rh     text,
  fecha         date        NOT NULL DEFAULT CURRENT_DATE,
  archivo_url   text,
  pagado        boolean     NOT NULL DEFAULT false,
  pagado_en     date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_recibos_honorarios_updated_at
  BEFORE UPDATE ON recibos_honorarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_recibos_honorarios_externo ON recibos_honorarios(externo_id);
CREATE INDEX idx_recibos_honorarios_empresa ON recibos_honorarios(empresa_id);

-- ============================================================================
-- D. MÓDULO: TESORERÍA
-- ============================================================================

-- Cajas chicas por empresa (puede haber varias: Yape, efectivo, banco, etc.)
CREATE TABLE cajas_chicas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre         text        NOT NULL,  -- 'Yape Raul', 'Caja efectivo', 'Interbank Karlo'
  moneda         moneda_caja NOT NULL DEFAULT 'PEN',
  saldo_inicial  decimal(12,2) NOT NULL DEFAULT 0,
  saldo_actual   decimal(12,2) NOT NULL DEFAULT 0,
  es_banco       boolean     NOT NULL DEFAULT false,  -- true = cuenta bancaria (sin gestión de saldo por ahora)
  activa         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cajas_chicas_updated_at
  BEFORE UPDATE ON cajas_chicas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_cajas_chicas_empresa ON cajas_chicas(empresa_id);

-- Movimientos de caja (ingresos, egresos, conversiones PEN<>USD)
CREATE TABLE movimientos_caja (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id           uuid          NOT NULL REFERENCES cajas_chicas(id) ON DELETE CASCADE,
  empresa_id        uuid          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo              tipo_mov_caja NOT NULL,
  monto             decimal(12,2) NOT NULL,
  moneda            moneda_caja   NOT NULL,

  -- Para conversiones (ej: sale PEN de caja A, entra USD a caja B)
  tipo_cambio_usado decimal(10,4),
  monto_convertido  decimal(12,2),
  caja_destino_id   uuid          REFERENCES cajas_chicas(id) ON DELETE SET NULL,

  concepto          text          NOT NULL,
  categoria         text,
  fecha             date          NOT NULL DEFAULT CURRENT_DATE,
  comprobante_url   text,
  agente_id         uuid          REFERENCES agentes(id) ON DELETE SET NULL,

  -- Referencia flexible a entidad origen (planilla, honorario, factura, etc.)
  referencia_tipo   text,
  referencia_id     uuid,

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_movimientos_caja_updated_at
  BEFORE UPDATE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_movimientos_caja_caja_fecha ON movimientos_caja(caja_id, fecha);
CREATE INDEX idx_movimientos_caja_empresa_fecha ON movimientos_caja(empresa_id, fecha);

-- Trigger: actualiza saldo_actual de la caja automáticamente
CREATE OR REPLACE FUNCTION actualizar_saldo_caja()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'ingreso' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual + NEW.monto,  updated_at = now() WHERE id = NEW.caja_id AND NOT es_banco;
    ELSIF NEW.tipo = 'egreso' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual - NEW.monto,  updated_at = now() WHERE id = NEW.caja_id AND NOT es_banco;
    ELSIF NEW.tipo = 'transferencia' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual - NEW.monto,  updated_at = now() WHERE id = NEW.caja_id AND NOT es_banco;
      IF NEW.caja_destino_id IS NOT NULL AND NEW.monto_convertido IS NOT NULL THEN
        UPDATE cajas_chicas SET saldo_actual = saldo_actual + NEW.monto_convertido, updated_at = now() WHERE id = NEW.caja_destino_id AND NOT es_banco;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.tipo = 'ingreso' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual - OLD.monto,  updated_at = now() WHERE id = OLD.caja_id AND NOT es_banco;
    ELSIF OLD.tipo = 'egreso' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual + OLD.monto,  updated_at = now() WHERE id = OLD.caja_id AND NOT es_banco;
    ELSIF OLD.tipo = 'transferencia' THEN
      UPDATE cajas_chicas SET saldo_actual = saldo_actual + OLD.monto,  updated_at = now() WHERE id = OLD.caja_id AND NOT es_banco;
      IF OLD.caja_destino_id IS NOT NULL AND OLD.monto_convertido IS NOT NULL THEN
        UPDATE cajas_chicas SET saldo_actual = saldo_actual - OLD.monto_convertido, updated_at = now() WHERE id = OLD.caja_destino_id AND NOT es_banco;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_actualizar_saldo_caja
  AFTER INSERT OR DELETE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_caja();

-- Facturas asociadas a gastos (pendientes de reembolso a caja chica)
-- Flujo: empleado paga con efectivo → emite factura → la empresa reembolsa a su caja
CREATE TABLE facturas_caja (
  id                     uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid                 NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  proveedor              text                 NOT NULL,
  numero_factura         text,
  monto                  decimal(12,2)        NOT NULL,
  moneda                 moneda_caja          NOT NULL DEFAULT 'PEN',
  fecha                  date                 NOT NULL DEFAULT CURRENT_DATE,
  concepto               text,
  caja_destino_id        uuid                 REFERENCES cajas_chicas(id) ON DELETE SET NULL,
  estado                 estado_factura_caja  NOT NULL DEFAULT 'pendiente',
  movimiento_reembolso_id uuid               REFERENCES movimientos_caja(id) ON DELETE SET NULL,
  agente_id              uuid                 REFERENCES agentes(id) ON DELETE SET NULL,
  comprobante_url        text,
  created_at             timestamptz          NOT NULL DEFAULT now(),
  updated_at             timestamptz          NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_facturas_caja_updated_at
  BEFORE UPDATE ON facturas_caja
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_facturas_caja_empresa ON facturas_caja(empresa_id);
CREATE INDEX idx_facturas_caja_estado ON facturas_caja(estado);

-- ============================================================================
-- E. GRANTS (misma política que el resto del sistema)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  config_asistencia, marcaciones_asistencia, historial_asistencia,
  contratos_empleado, planilla_periodos, planilla_items, movimientos_rrhh,
  certificados_medicos, externos_rh, recibos_honorarios,
  cajas_chicas, movimientos_caja, facturas_caja
TO service_role, authenticated;

GRANT SELECT ON
  config_asistencia, marcaciones_asistencia, historial_asistencia,
  contratos_empleado, planilla_periodos, planilla_items, movimientos_rrhh,
  certificados_medicos, externos_rh, recibos_honorarios,
  cajas_chicas, movimientos_caja, facturas_caja
TO anon;

-- ============================================================================
-- F. RLS (Row Level Security) — Habilitar en todas las tablas nuevas
-- ============================================================================

ALTER TABLE config_asistencia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcaciones_asistencia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_asistencia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_empleado      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_periodos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_rrhh        ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificados_medicos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE externos_rh             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos_honorarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas_chicas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja        ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_caja           ENABLE ROW LEVEL SECURITY;

-- Helper: ¿el agente autenticado pertenece a esta empresa?
CREATE OR REPLACE FUNCTION agente_en_empresa(p_empresa_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM agentes_empresas
    WHERE agente_id = auth.uid()
      AND empresa_id = p_empresa_id
      AND estado = 'activo'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: ¿es admin o manager en la empresa?
CREATE OR REPLACE FUNCTION agente_es_admin_o_manager(p_empresa_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM agentes_empresas
    WHERE agente_id = auth.uid()
      AND empresa_id = p_empresa_id
      AND rol IN ('admin', 'manager')
      AND estado = 'activo'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- == ASISTENCIA RLS ==

-- Todos los de la empresa pueden ver marcaciones (con selector de agente)
CREATE POLICY "asistencia_select" ON marcaciones_asistencia
  FOR SELECT USING (agente_en_empresa(empresa_id));

-- Cada agente puede insertar sus propias marcaciones
CREATE POLICY "asistencia_insert" ON marcaciones_asistencia
  FOR INSERT WITH CHECK (
    agente_id = auth.uid() AND agente_en_empresa(empresa_id)
  );

-- Admin/Manager pueden editar cualquier marcación; el agente solo la suya
CREATE POLICY "asistencia_update" ON marcaciones_asistencia
  FOR UPDATE USING (
    agente_id = auth.uid() OR agente_es_admin_o_manager(empresa_id)
  );

-- Solo admin/manager pueden eliminar
CREATE POLICY "asistencia_delete" ON marcaciones_asistencia
  FOR DELETE USING (agente_es_admin_o_manager(empresa_id));

-- Historial: todos de la empresa pueden ver
CREATE POLICY "historial_asistencia_select" ON historial_asistencia
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM marcaciones_asistencia m
      WHERE m.id = marcacion_id AND agente_en_empresa(m.empresa_id)
    )
  );

-- Config: solo admin puede escribir, todos pueden leer
CREATE POLICY "config_asistencia_select" ON config_asistencia
  FOR SELECT USING (agente_en_empresa(empresa_id));

CREATE POLICY "config_asistencia_write" ON config_asistencia
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- == RRHH RLS ==

-- Contratos: admin/manager ven todo; empleado solo el suyo
CREATE POLICY "contratos_select" ON contratos_empleado
  FOR SELECT USING (
    agente_id = auth.uid() OR agente_es_admin_o_manager(empresa_id)
  );
CREATE POLICY "contratos_write" ON contratos_empleado
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- Planilla períodos: admin/manager
CREATE POLICY "planilla_periodos_select" ON planilla_periodos
  FOR SELECT USING (agente_en_empresa(empresa_id));
CREATE POLICY "planilla_periodos_write" ON planilla_periodos
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- Ítems de planilla: admin/manager ven todos; empleado solo el suyo
CREATE POLICY "planilla_items_select" ON planilla_items
  FOR SELECT USING (
    agente_id = auth.uid() OR agente_es_admin_o_manager(empresa_id)
  );
CREATE POLICY "planilla_items_write" ON planilla_items
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- Movimientos RRHH: admin/manager
CREATE POLICY "mov_rrhh_select" ON movimientos_rrhh
  FOR SELECT USING (
    agente_id = auth.uid() OR agente_es_admin_o_manager(empresa_id)
  );
CREATE POLICY "mov_rrhh_write" ON movimientos_rrhh
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- Certificados médicos: agente ve/inserta los suyos; admin/manager aprueban
CREATE POLICY "cert_medicos_select" ON certificados_medicos
  FOR SELECT USING (
    agente_id = auth.uid() OR agente_es_admin_o_manager(empresa_id)
  );
CREATE POLICY "cert_medicos_insert" ON certificados_medicos
  FOR INSERT WITH CHECK (
    agente_id = auth.uid() AND agente_en_empresa(empresa_id)
  );
CREATE POLICY "cert_medicos_update" ON certificados_medicos
  FOR UPDATE USING (agente_es_admin_o_manager(empresa_id));

-- Externos RH: todos autenticados pueden ver; admin escribe
CREATE POLICY "externos_rh_select" ON externos_rh
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "externos_rh_write" ON externos_rh
  FOR ALL USING (auth.uid() IS NOT NULL);  -- refinado por empresa en el app

-- Recibos honorarios: empresas del agente
CREATE POLICY "recibos_honorarios_select" ON recibos_honorarios
  FOR SELECT USING (agente_en_empresa(empresa_id));
CREATE POLICY "recibos_honorarios_write" ON recibos_honorarios
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

-- == TESORERÍA RLS ==

CREATE POLICY "cajas_select" ON cajas_chicas
  FOR SELECT USING (agente_en_empresa(empresa_id));
CREATE POLICY "cajas_write" ON cajas_chicas
  FOR ALL USING (agente_es_admin_o_manager(empresa_id));

CREATE POLICY "movimientos_caja_select" ON movimientos_caja
  FOR SELECT USING (agente_en_empresa(empresa_id));
CREATE POLICY "movimientos_caja_write" ON movimientos_caja
  FOR ALL USING (agente_en_empresa(empresa_id));  -- cualquiera puede registrar un movimiento

CREATE POLICY "facturas_caja_select" ON facturas_caja
  FOR SELECT USING (agente_en_empresa(empresa_id));
CREATE POLICY "facturas_caja_insert" ON facturas_caja
  FOR INSERT WITH CHECK (agente_en_empresa(empresa_id));
CREATE POLICY "facturas_caja_update" ON facturas_caja
  FOR UPDATE USING (agente_es_admin_o_manager(empresa_id));

-- ============================================================================
-- FIN MIGRACIÓN 012
-- ============================================================================
