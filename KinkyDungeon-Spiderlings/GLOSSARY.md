# KD Spiderlings

This glossary defines the field-command terms used by the current implementation.

## Field command

**Global field AI**:
The highest commander of field deployment and mobile Spiderlings assignments across the current floor. It mediates requests for support between fields.
_Avoid_: omniscient combat AI, independent field-to-field loans

**Field sub AI**:
The commander responsible for Spinner assignments within one managed capture field. It requests additional support through the global field AI.
_Avoid_: commander of every Spiderling species, second simultaneous commander

**Capture field**:
A managed region of Spiderling web structures intended to contain and capture a target. Its physical structures and its current construction work are distinct concepts.
_Avoid_: every web tile, one concentric ring equals one field

**Field project**:
The ongoing work to construct, repair and operate a capture field. A project's investment includes work already completed, while its remaining work describes what is still needed.
_Avoid_: one-time site selection, a moving copy of the target

**Field permit**:
Population authorization for one independent capture field. The current map grants `floor(n / 4)` permits for its living hostile Spinners, excluding allied, party and imprisoned actors. Temporary incapacity and existing duties retain population membership. New deployments must fit both this permit count and the configured maximum. Concentric rings share one permit; a lower count pauses new deployment without removing existing fields.
_Avoid_: overwriting the configured limit, four active builders required per field, permission to spawn more Spinners

**Field readiness**:
Preparation staff requested when a character is within four reachable steps of a field boundary or inside its outer area. Arrival and the ability to serve the current target remain separate from a promise of support. Entering the capture core still requires native closure and a qualifying melee hit to begin Capture.
_Avoid_: proximity capture, travelling helpers counted as arrived, global planning granting combat perception

**Field retirement**:
The deliberate ending of a field project and its active management, releasing its capture-field slot and leaving residual webs. Retirement is distinct from waiting for workers or recovering from a temporary obstruction.
_Avoid_: temporary pause, automatic deletion on target movement

**Residual webs**:
Web structures left after a capture field has retired, without that field's active sealing, capture, recovery or repair management. Unused residual webs gradually dissipate; structures still shared by an active field retain that field's separate role.
_Avoid_: dormant capture field, new independent web-wall category
