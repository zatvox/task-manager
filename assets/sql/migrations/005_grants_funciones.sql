-- ============================================================================
-- ZV TASK MANAGER · MIGRACIÓN 005
-- Garantiza GRANT EXECUTE en todas las funciones RLS helper para el rol
-- authenticated. Si ya existían, la sentencia es idempotente (no falla).
-- Ejecutar en Supabase SQL Editor si el admin/fundador recibe 403 al crear
-- o editar departamentos.
-- ============================================================================

GRANT EXECUTE ON FUNCTION es_admin_empresa(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION es_manager_o_admin_empresa(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION es_miembro_empresa(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION es_miembro_proyecto(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION es_primera_membresia(uuid)        TO authenticated;
