/* ============================================================
   MOTOR FAILURE ANALYSIS  (HT / LT)
   The user enters what was found (failure location, symptoms, test results, operating
   history). The engine scores every known failure cause against those findings and
   returns a ranked list of probable causes with: why it happens, how to confirm it,
   corrective action and prevention.

   Knowledge base sources:
     - HECO "Why Motors Fail" series, Parts 1-4 (mechanical, AC electrical, DC electrical failures)
     - ABB "Condition Assessment for HT Motors and Generators" (LEAP packages and tests)
     - Standard motor-reliability / failure-analysis practice (IEEE 43, IEC 60034-27, EASA guidance)

   Loaded after app.js and lubrication.js. Self-registering: adds the tab to NAV, the dashboard
   card and the route table, so app.js does not need to be edited. Uses no database - nothing is
   written to Firestore unless the editor chooses "Save to Equipment History".
   ============================================================ */

ICONS.diagnose = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="21" y1="21" x2="15.2" y2="15.2"/><path d="M10.5 7.5v3.4M10.5 13.4h.01"/></svg>`;

/* ---------------- Findings the user can tick (id -> label), grouped ---------------- */
const FA_GROUPS = [
  { id:'event', title:'1. What happened - protection / operation', tags:[
    ['trip_ol','Tripped on overload / thermal relay'],
    ['trip_ef','Tripped on earth fault'],
    ['trip_sc','Tripped on short-circuit / differential / instantaneous'],
    ['trip_unb','Tripped on phase unbalance / negative-sequence / single-phasing protection'],
    ['trip_start','Tripped during starting / failed to accelerate (start-time exceeded, locked rotor)'],
    ['no_start_hum','Motor hums but does not start'],
    ['trip_vib_temp','Tripped / alarmed on high bearing temperature or vibration'],
    ['trip_rep','Repeated tripping (breaker trips again on re-closing)'],
    ['no_damage','No physical damage found on inspection (motor looks healthy)'],
  ]},
  { id:'winding', title:'2. Stator winding / core - physical findings', tags:[
    ['w_uniform','Uniform burning or discolouration of all three phases'],
    ['w_onephase','One phase (or two) burnt, remaining phase(s) healthy'],
    ['w_local','Localised burn of a few coils / turn-to-turn short'],
    ['w_overhang','Failure at the end-winding (overhang / knuckle), damaged ties or blocking'],
    ['w_slotexit','Insulation puncture or burn at slot exit / inside the slot'],
    ['w_powder','White or grey powder, tracking marks or ozone smell at slot exits'],
    ['w_cracked','Brittle, cracked or heat-darkened (aged) insulation'],
    ['w_wet','Winding damp / wet, rust or condensation signs'],
    ['w_dirty','Oil, coal dust or fly-ash on or inside winding; vent ducts choked'],
    ['w_grease','Grease thrown into the winding'],
    ['w_loosecoil','Loose wedges / coil movement, rubbing marks, brown dust in slots'],
    ['w_core','Core hot-spots, melted / burnt or loose laminations'],
    ['w_rubmark','Rotor-to-stator rub marks on stator bore or rotor surface'],
  ]},
  { id:'tests', title:'3. Test and monitoring results', tags:[
    ['t_ir_low','Insulation resistance / PI low (below limit)'],
    ['t_pd_high','High partial discharge or tan-delta tip-up reported'],
    ['t_res_unb','Winding resistance unbalance between phases'],
    ['t_surge','Surge / RSO / turn-insulation test failed'],
    ['t_mcsa_bar','MCSA shows rotor-bar sidebands'],
    ['t_cur_high','Running current higher than rating'],
    ['t_cur_unb','Unequal phase currents / high negative-sequence current'],
    ['t_volt','Supply voltage unbalance, under/over-voltage or deep dip on starting'],
    ['t_vib_1x','High 1x rpm vibration (radial)'],
    ['t_vib_2x','High 2x rpm and / or high axial vibration'],
    ['t_vib_harm','Vibration with harmonics / sub-harmonics (looseness pattern)'],
    ['t_vib_2lf','Vibration peak at 2x line frequency (100 Hz)'],
    ['t_vib_bear','Bearing-defect frequencies / high-frequency (envelope) vibration / high AE dB-distress'],
  ]},
  { id:'mech', title:'4. Bearings and mechanical findings', tags:[
    ['b_hot','Bearing overheating'],
    ['b_noise','Bearing noise / rumbling'],
    ['b_dry','Grease dried, hardened, dark or burnt / oil low or burnt'],
    ['b_pushed','Grease leaking from seals / cap, shields bulged, excess grease'],
    ['b_flute','Fluting, frosting or pitting on bearing race (washboard pattern)'],
    ['b_blue','Blue / straw discolouration of balls, races or journal'],
    ['b_cage','Bearing cage broken, balls / rollers damaged or bearing seized'],
    ['b_babbitt','Babbitt (white-metal) wiped, journal scored or oil ring stuck (sleeve bearing)'],
    ['b_creep','Bearing race spun / creeping, worn housing, fretting or undersized shaft journal'],
    ['b_contam','Water, dust or dirt found in bearing / lubricant'],
    ['m_coupling','Coupling worn or damaged, bolts failed, elastic element torn'],
    ['m_shaft','Shaft bent, cracked or broken'],
    ['m_loose','Loose foundation bolts, cracked base / grouting, soft foot'],
    ['m_fan','Cooling-fan blade damaged / loose / rubbing, or deposits on driven fan'],
    ['m_jam','Driven equipment jammed / choked (mill, crusher, pump seized)'],
    ['m_thrust','Thrust bearing distress (vertical motor)'],
  ]},
  { id:'cool', title:'5. Cooling, terminals and special machines', tags:[
    ['c_blocked','Cooling-air passages, filters or coolers blocked / dirty'],
    ['c_cooler','Cooler-tube leakage / cooling-water problem'],
    ['c_ambient','High ambient or poor ventilation in motor room'],
    ['tb_flash','Flash-over or burnt terminals in terminal box / cable-termination failure'],
    ['tb_hot','Loose or overheated lugs / terminal connections'],
    ['ct_contactor','Contactor, fuse or starter fault found (LT)'],
    ['r_bars','Cracked / broken rotor bars or end-ring, heat-discoloured bars'],
    ['r_speed','Speed low, hunting or oscillating current'],
    ['r_sparkring','Sparking / grooving of slip rings, uneven brush wear (slip-ring motor)'],
    ['ex_field','Field / exciter / diode circuit fault (synchronous motor)'],
    ['dc_comm','Commutator grooved, scored or blackened; visible arcing (DC motor)'],
    ['dc_brush','Uneven or rapid brush wear, loose / misaligned brushes, carbon tracking in holder (DC)'],
    ['dc_field','Field / interpole earth fault or burnt field coil (DC motor)'],
  ]},
  { id:'ctx', title:'6. Operating conditions and history', tags:[
    ['ctx_vfd','Motor is driven by a VFD / soft-starter'],
    ['ctx_freqstart','Frequent starts / stops, or long acceleration time'],
    ['ctx_dust','Dusty / coal-dust / fly-ash area'],
    ['ctx_humid','Humid, wet or outdoor location'],
    ['ctx_corrosive','Corrosive / chemical atmosphere'],
    ['ctx_hot','Hot surroundings, or motor ran hot for long'],
    ['ctx_idle','Was idle / standby for a long time (space heater absent or not working)'],
    ['ctx_old','More than 15-20 years in service'],
    ['ctx_young','Failed within about 1 year of installation / overhaul / rewinding'],
    ['ctx_overdue_lub','Greasing / oil change overdue or no record'],
    ['ctx_just_greased','Failure soon after greasing (within days)'],
    ['ctx_loadchange','Process load or driven equipment changed / increased recently'],
    ['ctx_supply','Recent supply disturbance, switching operation or lightning'],
    ['ctx_realigned','Recently re-installed, re-coupled or realigned'],
  ]},
];
const FA_LABEL = {};
FA_GROUPS.forEach(g => g.tags.forEach(t => FA_LABEL[t[0]] = t[1]));

const FA_MACHINES = [['scim','Induction - squirrel cage'],['wrim','Induction - slip ring (wound rotor)'],['sync','Synchronous'],['dc','DC motor']];
const FA_LOCS = [['','Not sure'],['stator','Stator winding'],['rotor','Rotor / rotor winding / rotor bars'],['bearing','Bearing (DE / NDE / both)'],
  ['shaft','Shaft / coupling'],['terminal','Terminal box / cable end'],['brush','Slip rings / commutator / brushes'],
  ['core','Stator core / frame'],['cooling','Cooling system'],['none','Trip only - no visible damage']];
const FA_BRG = [['','Not sure'],['rolling','Rolling element (ball / roller)'],['sleeve','Sleeve (journal) bearing']];

/* ---------------- Knowledge base: failure causes ----------------
   ev = evidence weights (5 = diagnostic, 3 = supporting, 1 = weak hint)
   loc = failure locations where this cause occurs;  mt / volt / brg = applicability filters
   leap = ABB condition-assessment package that best confirms it (HT motors) */
const FA_CAUSES = [
 /* ===== Electrical - stator winding ===== */
 { id:'overload', name:"Winding failure due to sustained overload", cat:"Electrical", loc:['stator','none'], leap:'std',
   src:"HECO Part 3 (#1) / Part 1",
   why:"The motor ran beyond its design load for long periods (misapplication at design stage, or process demand that grew). Excess current overheats the winding, the insulation ages quickly and finally breaks down.",
   ev:{trip_ol:4,w_uniform:4,t_cur_high:4,ctx_loadchange:3,m_jam:2,trip_rep:1,w_cracked:1,t_ir_low:1},
   confirm:["Compare running current with nameplate FLC over a full load cycle (log it)","Check thermal-relay / overload settings against FLC and service factor","Winding resistance and IR/PI after cooling; look for uniform discolouration","Review driven-equipment load (chokes, damper / valve position, process change)"],
   fix:["Rewind or replace the damaged winding (do not just reset and restart)","Remove the cause of overload or re-rate / up-size the motor","Correct relay settings to FLC"],
   prev:["Periodic current trending against nameplate","Re-evaluate motor sizing whenever process conditions change","Insulation-resistance testing at planned shutdowns"] },

 { id:'cooling', name:"Overheating from blocked ventilation / cooling failure", cat:"Thermal", loc:['stator','cooling','core'], leap:'basic',
   src:"HECO Part 1 (AC electrical #2) / Part 3",
   why:"Dirt, ash, choked filters, damaged fan or fouled coolers stop heat leaving the motor. Winding runs hot even at normal load, so insulation life halves for every ~10 C of extra temperature.",
   ev:{c_blocked:5,c_cooler:4,w_dirty:3,m_fan:3,w_uniform:3,c_ambient:3,ctx_dust:2,ctx_hot:2,w_cracked:2,b_hot:1},
   confirm:["Inspect air path, filters, vent ducts (borescope for radial ducts > 7 mm) and cooler tubes","Check fan blades, direction of rotation, cooling-water flow and inlet temperature","Compare winding RTD temperatures with normal trend at the same load"],
   fix:["Clean (dry-ice / solvent as required) and re-varnish if insulation is affected","Repair or replace fan, filters and cooler tubes","Rewind if insulation is already damaged"],
   prev:["Scheduled cleaning of filters, vents and coolers","Alarm / trip on winding RTD and cooling-water flow","Control ambient temperature in the motor room"] },

 { id:'aging', name:"Insulation ageing / thermal deterioration (end of life)", cat:"Electrical", loc:['stator'], leap:'std',
   src:"HECO Part 1 (AC electrical #3) / ABB Life Expectancy Analysis",
   why:"Thermal, electrical and mechanical stresses steadily reduce insulation strength. Failure occurs when the remaining strength falls to the level of the stress acting on it - typical for old machines.",
   ev:{w_cracked:5,ctx_old:4,t_ir_low:3,t_pd_high:2,ctx_hot:1,ctx_freqstart:1,w_powder:1},
   confirm:["LEAP Standard: PDCA, tan-delta / capacitance, NLIBA, PD analysis and winding resistance for a life estimate (80 % confidence)","Trend IR / PI history","Visual check for cracking, discolouration and loose tapes at overhang"],
   fix:["Rewind or replace; consider re-insulation of the winding","Plan outage using remaining-life estimate"],
   prev:["Periodic condition assessment (LEAP Basic -> Standard -> Advanced as machine ages)","Keep operating temperature low and start counts within limits"] },

 { id:'moisture', name:"Grounded winding - moisture / condensation", cat:"Environmental", loc:['stator'], leap:'std',
   src:"HECO Part 3 (#4) / Part 4 (grounded fields)",
   why:"Moisture or condensation lowers insulation resistance and provides a path to ground. Standby or outdoor motors without working space heaters are the usual victims.",
   ev:{trip_ef:5,w_wet:5,t_ir_low:4,ctx_idle:4,ctx_humid:3,trip_rep:2,w_slotexit:2,ctx_corrosive:1,w_dirty:1},
   confirm:["IR / PI at 5 kV (use PDCA to separate moisture from contamination)","Check space-heater circuit and current","Inspect for rust, water marks and blocked drain plugs"],
   fix:["Dry out (heater / low-voltage current) and re-test IR before charging","Clean and re-varnish if tracking is seen; rewind if ground fault is hard"],
   prev:["Keep space heaters ON whenever the motor is stopped; add heater monitoring","Store spares in a dry heated area","Fit proper seals / canopy for outdoor motors"] },

 { id:'contam', name:"Winding contamination (coal dust, fly-ash, oil) leading to tracking", cat:"Environmental", loc:['stator','cooling'], leap:'std',
   src:"HECO Part 3 (#3-4) / ABB PDCA",
   why:"Conductive or hygroscopic deposits build up on end-windings and in ducts, cause surface tracking, higher temperature and eventually ground / phase faults. Common in coal-handling and ash-area motors.",
   ev:{w_dirty:5,ctx_dust:4,c_blocked:3,t_ir_low:3,w_powder:2,trip_ef:2,ctx_corrosive:2,w_slotexit:1,w_uniform:1,w_wet:1,ctx_humid:1},
   confirm:["PDCA gives severity, type and location of contamination","Visual inspection of overhang and vent ducts; tracking marks","Compare IR/PI before and after cleaning"],
   fix:["Clean (solvent or dry-ice), bake and re-varnish; rewind if tracking has damaged insulation","Seal / filter the cooling-air inlet"],
   prev:["Periodic cleaning schedule for dusty areas","Use filtered or closed (TEFC / CACA) motors where possible","Test IR before each restart after a shutdown"] },

 { id:'singlephase', name:"Single-phasing / voltage or current phase imbalance", cat:"Electrical", loc:['stator','terminal','none'], leap:'std',
   src:"HECO Part 3 (#5) / Part 1",
   why:"Loss of one phase (blown fuse, open phase at transformer, contactor or cable fault) or large voltage unbalance overloads the remaining windings. Unequal heating burns one or two phases.",
   ev:{w_onephase:5,trip_unb:4,t_cur_unb:4,no_start_hum:3,ct_contactor:3,t_volt:2,t_vib_2lf:2,t_res_unb:1,tb_hot:1},
   confirm:["Check fuses, contactor / breaker poles, cable terminations and the supply for an open phase","Record voltage and current per phase; calculate unbalance","Check negative-sequence / phase-failure relay settings"],
   fix:["Repair the cause of phase loss before replacing the motor","Rewind burnt phases","Fit or re-test phase-failure protection"],
   prev:["Phase-monitoring relays with fast trip","Routine checks of power-supply system and contacts","Thermography of terminations"] },

 { id:'interturn', name:"Inter-turn (turn-to-turn) short in stator coils", cat:"Electrical", loc:['stator'], leap:'std',
   src:"HECO Part 3 / ABB Winding Resistance, RSO and surge tests",
   why:"Turn insulation fails locally - from voltage spikes, vibration abrasion, thermal ageing or moisture. The shorted turns carry a huge circulating current, burn that coil and then escalate to a ground or phase fault.",
   ev:{w_local:5,t_surge:5,t_res_unb:3,trip_sc:3,t_cur_unb:2,t_vib_2lf:2,ctx_supply:2,ctx_vfd:2,ctx_freqstart:2,w_loosecoil:1,trip_unb:1},
   confirm:["Surge-comparison test and winding-resistance balance (micro-ohm)","Check for localised discolouration; NLIBA / tan-delta for aged turn insulation","Review switching / VFD history"],
   fix:["Rewind (or replace the coil group if form-wound and spare coils exist)","Fit surge capacitors / arresters if switching is the cause"],
   prev:["Surge testing at overhauls","Limit starts; control switching transients","Avoid long cable runs from VFD without filters"] },

 { id:'endwinding', name:"End-winding (overhang) movement / bracing failure", cat:"Mechanical-Electrical", loc:['stator'], volt:['HT'], leap:'adv',
   src:"ABB Natural Frequency Test / Visual Inspections",
   why:"Starting currents create large electromagnetic forces on the overhang. Loose blocking or ties let coils vibrate and abrade insulation until a phase-to-phase short occurs at the knuckle. Worse if the overhang natural frequency lies near 2x line frequency.",
   ev:{w_overhang:5,trip_sc:4,ctx_freqstart:4,t_vib_2lf:2,w_dirty:2,w_loosecoil:2,trip_rep:1,ctx_old:1},
   confirm:["Natural frequency (bump) test of end-windings - peaks near 100 Hz are dangerous","Visual inspection of ties, blocks and insulation abrasion (LEAP Advanced)","Dust / grease-paste marks around overhang"],
   fix:["Re-tie, re-block and add stiffness to the overhang; repair or rewind failed coils","Re-varnish"],
   prev:["Limit starts per hour","Natural-frequency mapping when overhauling","Inspect overhang each Level-3 overhaul"] },

 { id:'pd', name:"Partial discharge / slot-exit stress-grading failure", cat:"Electrical", loc:['stator'], volt:['HT'], leap:'std',
   src:"ABB PD Analysis, Tan-delta, NLIBA",
   why:"In high-voltage windings, voids, delamination or a deteriorated stress-grading / corona-protection coating cause discharges that erode insulation. White powder and ozone at slot exits are the classic sign; erosion leads to a slot-exit ground fault.",
   ev:{t_pd_high:5,w_powder:5,w_slotexit:4,trip_ef:2,ctx_old:2,w_dirty:2,t_ir_low:1,ctx_humid:1,ctx_corrosive:1},
   confirm:["Offline PD with phase-resolved patterns, tan-delta tip-up and NLIBA (LEAP Standard)","Visual check at slot exits for powder, burnt stress grade paint","Compare with earlier PD readings"],
   fix:["Repair eroded areas, re-apply stress-grading paint, re-varnish or resin-fill","Rewind if erosion is deep"],
   prev:["Offline PD and tan-delta trend at planned outages","Keep winding clean and dry; avoid hi-pot unless repairs were done"] },

 { id:'wedges', name:"Loose wedges / loose coils in slot", cat:"Mechanical-Electrical", loc:['stator'], volt:['HT'], leap:'adv',
   src:"ABB Wedge Tightness Check / PDCA",
   why:"Slot wedges or fillers shrink or loosen over time. The coil then vibrates in the slot (frequently at 2x line frequency), abrades insulation and may discharge to the core.",
   ev:{w_loosecoil:5,ctx_freqstart:3,w_powder:2,w_slotexit:2,t_vib_2lf:2,ctx_old:2,trip_ef:1},
   confirm:["Wedge tap test (hollow sound = loose) and wedge looseness scoring","PDCA indicates looseness of coils / wedges","Look for brown dust or greasing-paste in slots"],
   fix:["Re-wedge / re-pack loose slots","Re-varnish to lock the coils"],
   prev:["Wedge tightness check at each overhaul","VPI / resin top-up as needed"] },

 { id:'surge', name:"Voltage surge / VFD dv/dt / switching transients", cat:"Electrical", loc:['stator'], leap:'basic',
   src:"HECO Part 2 (shaft voltage with VFDs) / general practice",
   why:"Fast voltage fronts from VFDs, vacuum-breaker switching or lightning concentrate stress on the first turns of a coil, causing early turn-insulation failure (often soon after a rewind or installation).",
   ev:{ctx_vfd:4,ctx_supply:4,w_local:3,t_surge:3,trip_sc:2,ctx_young:2},
   confirm:["Surge test of the winding; check which coil failed (line-end coils point to surges)","Review switching events and VFD output filter / cable length","Check surge arrester / RC-snubber condition"],
   fix:["Rewind with inverter-duty / enhanced turn insulation","Add dv/dt or sine filter, surge arresters or RC snubbers"],
   prev:["Inverter-duty motors on VFDs","Keep VFD cable short; use proper grounding"] },

 { id:'voltage', name:"Abnormal supply voltage (under / over / dips)", cat:"Electrical", loc:['stator','rotor','none'], leap:'basic',
   src:"ABB MACHSense-P power quality / general practice",
   why:"Low voltage raises current and slip; high voltage saturates the core; deep dips on starting let the motor stall or take excessive time to accelerate. All increase heating and stress.",
   ev:{t_volt:5,t_cur_high:2,t_cur_unb:2,trip_ol:2,trip_start:2,ctx_supply:2,w_uniform:1,no_start_hum:1},
   confirm:["Power-quality recording (voltage, current, harmonics) across a start and normal run","Check transformer tap position and upstream faults"],
   fix:["Correct voltage (tap change, capacitor / regulator, upstream repair)","Repair the motor for any damage that occurred"],
   prev:["Voltage monitoring and alarms; undervoltage protection set correctly"] },

 { id:'startduty', name:"Starting-duty exceeded (frequent / prolonged starts)", cat:"Operational", loc:['stator','rotor','shaft'], leap:'adv',
   src:"ABB Life Expectancy (number of starts) / general practice",
   why:"Each start heats rotor bars and stator end-windings and applies large mechanical forces. Too many starts, or long acceleration against high inertia, cracks rotor bars and loosens the end-winding.",
   ev:{ctx_freqstart:5,trip_start:4,r_bars:3,w_overhang:2,t_mcsa_bar:2,ctx_loadchange:1,t_volt:1,w_loosecoil:1,m_shaft:1},
   confirm:["Check starts per hour / hot-start count against the manufacturer's curve","Check acceleration time and start-current log","MCSA for rotor-bar health"],
   fix:["Repair rotor / winding as found","Re-set start-inhibit timers and interlocks","Consider soft-starter or VFD if load inertia is high"],
   prev:["Enforce start limits in DCS / relay","Record starts for life assessment"] },

 { id:'stall', name:"Stalled / locked rotor or driven-equipment jam", cat:"Operational", loc:['stator','rotor','shaft','none'], leap:'basic',
   src:"HECO Part 4 (overload due to stalling) / general practice",
   why:"A jammed mill, crusher, pump or fan holds the rotor at standstill. Locked-rotor current (5-8x FLC) overheats the winding within seconds and can crack rotor bars and shafts.",
   ev:{m_jam:5,trip_start:4,no_start_hum:4,w_uniform:3,t_cur_high:3,trip_ol:2,r_bars:2,ctx_loadchange:2,m_shaft:1},
   confirm:["Turn the driven equipment by hand / barring to check for jamming","Check process conditions at the time (choking, foreign material, closed valve)","Inspect rotor bars and shaft"],
   fix:["Clear the jam and fix process cause","Rewind / repair rotor if damaged"],
   prev:["Process interlocks and chute-choke / mill-trip protection","Correct locked-rotor protection settings"] },

 /* ===== Rotor / special machines ===== */
 { id:'rotorbars', name:"Rotor-bar / end-ring cracking (cage rotor)", cat:"Electrical-Mechanical", loc:['rotor'], mt:['scim'], leap:'rb',
   src:"ABB MCSA / Vibration (LEAP Rotor & Bearings)",
   why:"Thermal and mechanical stress during starts fatigues bar-to-ring joints. Broken bars cause current pulsation, speed fluctuation, sidebands around line frequency and heating of neighbouring bars.",
   ev:{r_bars:5,t_mcsa_bar:5,r_speed:3,ctx_freqstart:3,trip_start:2,t_vib_1x:1,w_rubmark:1},
   confirm:["MCSA with 3-phase simultaneous recording (needs load variation)","Vibration spectrum for sidebands","Growler / bar-current test or visual inspection at overhaul"],
   fix:["Repair / re-braze bars or replace rotor","Review start duty and acceleration time"],
   prev:["Periodic MCSA on critical HT motors","Limit starts"] },

 { id:'sliprings', name:"Slip-ring / brush-gear or rotor-circuit problem", cat:"Electrical", loc:['rotor','brush'], mt:['wrim'], leap:'rb',
   src:"ABB scope (slip-ring motors) / general practice",
   why:"Worn or sticking brushes, grooved rings, dirt or a faulty rotor winding / external resistor cause sparking, uneven rotor current, low speed and overheating.",
   ev:{r_sparkring:5,r_speed:3,t_cur_unb:2,trip_start:2,ctx_dust:2,no_start_hum:1,w_dirty:1},
   confirm:["Inspect rings and brushes (wear, spring pressure, grooving, carbon dust)","Measure rotor winding resistance / insulation and external resistance steps","Check rotor-current balance during start"],
   fix:["Re-skim rings, replace brushes, clean brush-gear","Repair rotor winding or starter resistor"],
   prev:["Scheduled brush inspection and replacement","Keep brush housing clean"] },

 { id:'exciter', name:"Field / exciter / diode circuit fault (synchronous motor)", cat:"Electrical", loc:['rotor','brush'], mt:['sync'], leap:'adv',
   src:"ABB LEAP Premium scope (rotor, exciter, diodes)",
   why:"Loss or weakness of excitation, an earthed field, failed rotating diodes or damper-winding damage cause pole slipping, overheating and tripping.",
   ev:{ex_field:5,r_speed:2,t_cur_high:1,trip_ol:1,trip_start:1},
   confirm:["Field insulation and winding resistance","Diode and RTD checks, RSO on rotor winding","Exciter / PMG inspection"],
   fix:["Repair field winding / replace diodes / fix exciter"],
   prev:["Periodic field insulation test and exciter inspection"] },

 /* ===== Mechanical - bearings ===== */
 { id:'underlube', name:"Bearing failure - under-lubrication", cat:"Mechanical", loc:['bearing'], leap:'rb',
   src:"HECO Part 2 (#1)",
   why:"Insufficient grease or oil lets metal touch metal: surface scoring, heat, shaft and housing damage and eventually rotor-stator contact. By the time it is noticed the repair can be a full rewind or replacement.",
   ev:{b_dry:5,ctx_overdue_lub:5,b_hot:3,b_blue:3,t_vib_bear:3,b_noise:2,b_cage:2,trip_vib_temp:2,w_rubmark:1},
   confirm:["Acoustic-emission (dB / distress) and enveloped vibration - detects lack of lubrication early","Check grease condition and quantity; review the greasing log","Inspect journal / race for scoring and blue discolouration"],
   fix:["Replace bearing; re-grease with correct type and quantity","Inspect shaft journal and housing for wear (machine or repair)"],
   prev:["Route-based greasing schedule by bearing size and runtime (see Lubrication Details tab)","Use calibrated grease guns or ultrasound-guided greasing"] },

 { id:'overlube', name:"Bearing failure - over-lubrication", cat:"Mechanical", loc:['bearing','stator'], brg:'rolling', leap:'rb',
   src:"HECO Part 2 (#2)",
   why:"Too much grease raises bearing pressure (bearings rated for ~500 psi can see 5,000-6,000 psi when grease is trapped). Grease pushes past seals into the winding, blocks air flow, overheats and can collapse bearing shields.",
   ev:{b_pushed:5,w_grease:5,ctx_just_greased:4,b_hot:3,b_cage:1,c_blocked:1,w_uniform:1,trip_vib_temp:1},
   confirm:["Check grease quantity per shot and frequency in the greasing log","Look for grease in winding, around seals and in drain","Bearing temperature right after greasing"],
   fix:["Clean winding of grease; replace bearing / shields as needed","Open drain plugs and purge excess correctly"],
   prev:["Grease by measured quantity (not by feel); use calibrated gun or ultrasound","Follow the quantity given on the lubrication schedule"] },

 { id:'contamlube', name:"Lubricant contamination or wrong / incompatible grease", cat:"Mechanical", loc:['bearing'], leap:'rb',
   src:"HECO Part 2 / general practice",
   why:"Dust, water or an incompatible grease (mixed thickener types, wrong grade) breaks down the lubricating film, causes pitting and corrosion and raises bearing temperature.",
   ev:{b_contam:5,b_dry:2,b_hot:2,b_noise:2,t_vib_bear:2,ctx_dust:2,ctx_humid:1,ctx_corrosive:1,b_cage:1},
   confirm:["Inspect used grease / oil (colour, texture, particles, water)","Check grease type used against OEM spec; check seals and breathers"],
   fix:["Flush / replace lubricant and bearing; use the specified grease","Replace worn seals"],
   prev:["Colour-coded grease guns and labelled grease points","Seal and breather upkeep in dusty / wet areas"] },

 { id:'sleeve', name:"Sleeve-bearing failure (oil starvation, oil-ring jam, babbitt wipe)", cat:"Mechanical", loc:['bearing'], brg:'sleeve', leap:'rb',
   src:"General practice for HT sleeve-bearing motors / HECO Part 2",
   why:"Low oil level, a stuck oil ring, contaminated oil or poor alignment breaks the oil film so the journal wipes the white-metal. Temperature rises quickly and the bearing may seize.",
   ev:{b_babbitt:5,b_hot:3,trip_vib_temp:3,b_dry:3,b_contam:2,ctx_overdue_lub:1,t_vib_1x:1},
   confirm:["Check oil level, oil-ring rotation and oil quality","Inspect babbitt and journal; check clearances","Check bearing RTD trend"],
   fix:["Re-metal or replace the bearing; machine or polish journal","Refill with correct oil grade"],
   prev:["Daily oil-level / temperature checks","Periodic oil analysis and change"] },

 { id:'shaftvolt', name:"Bearing damage from shaft voltage / bearing currents", cat:"Electrical-Mechanical", loc:['bearing'], leap:'rb',
   src:"HECO Part 2 (#3)",
   why:"VFD common-mode voltage (and magnetic asymmetry in large machines) drives current through the bearing. Discharges create pits (EDM), frosting and fluting on the race, noisy bearings and early failure.",
   ev:{b_flute:5,ctx_vfd:4,t_vib_bear:3,b_noise:2,ctx_young:2,b_cage:1,b_dry:1},
   confirm:["Inspect races for fluting / frosting","Measure shaft-to-frame voltage with an oscilloscope","Check that insulated bearing / grounding ring is intact"],
   fix:["Replace bearing with ceramic-coated / hybrid type","Fit carbon grounding brush or shaft-grounding ring (e.g. Aegis); repair bonding"],
   prev:["Proper bonding / grounding of motor and VFD","Insulated NDE bearing on large machines; verify insulation periodically"] },

 { id:'misalign', name:"Misalignment between motor and driven equipment", cat:"Mechanical", loc:['bearing','shaft'], leap:'rb',
   src:"HECO Part 2 (#5)",
   why:"Misalignment puts uneven loads on bearings, shaft and housing, raising vibration and shortening bearing life; it also damages fits and couplings. Higher-speed motors are the most vulnerable.",
   ev:{t_vib_2x:5,m_coupling:4,ctx_realigned:4,m_shaft:3,b_hot:2,t_vib_1x:1,b_noise:1,b_cage:1,m_loose:1,w_rubmark:1},
   confirm:["Laser / dial alignment check, hot and cold (thermal growth)","Vibration: 2x rpm and axial amplitudes, phase readings","Check soft foot and pipe strain"],
   fix:["Re-align with laser tools; replace damaged coupling and bearings","Check shaft run-out"],
   prev:["Laser alignment after every reinstallation","Vibration monitoring in regular inspections"] },

 { id:'unbalance', name:"Rotor or driven-component unbalance", cat:"Mechanical", loc:['bearing','shaft','rotor'], leap:'rb',
   src:"ABB Vibration Signature Analysis",
   why:"Uneven mass (fan blade erosion, deposits, lost balance weight, bent shaft) produces a once-per-rev force that loads the bearings and foundation.",
   ev:{t_vib_1x:5,m_fan:4,b_noise:1,m_loose:1,b_hot:1,ctx_dust:1,m_shaft:1,b_creep:1},
   confirm:["Vibration spectrum (dominant 1x), phase check radial in-phase","Inspect fan / impeller for erosion or build-up; uncoupled run test"],
   fix:["Clean and balance in place or in shop; replace damaged fan"],
   prev:["Balance after every repair; vibration trending"] },

 { id:'looseness', name:"Mechanical looseness / foundation weakness / soft foot", cat:"Mechanical", loc:['bearing','shaft','none'], leap:'rb',
   src:"ABB Vibration Signature Analysis",
   why:"Loose bolts, cracked grouting or frame, or a soft foot lets the machine move, producing harmonics and sub-harmonics and loading bearings unevenly.",
   ev:{m_loose:5,t_vib_harm:5,b_creep:2,t_vib_1x:1,trip_vib_temp:1,ctx_realigned:1,ctx_old:1},
   confirm:["Spectrum with harmonics of 1x / 0.5x","Soft-foot check, torque check of foundation and cap bolts","Inspect baseplate and grouting"],
   fix:["Tighten, re-grout, shim and correct soft foot; repair frame cracks"],
   prev:["Foundation checks at each overhaul"] },

 { id:'fits', name:"Out-of-tolerance mechanical fits (shaft journal, bearing housing)", cat:"Mechanical", loc:['bearing','shaft'], leap:'rb',
   src:"HECO Part 2 (#4)",
   why:"Worn housings, undersized journals or loose bearing fits let the race creep and fret, causing noise, heat and eventually rotor-stator contact. Often develops slowly after repeated bearing changes.",
   ev:{b_creep:5,b_noise:2,w_rubmark:2,b_hot:2,t_vib_harm:2,ctx_young:2,b_cage:1,t_vib_bear:1,ctx_old:1},
   confirm:["Measure journal and housing bore with micrometers / bore gauges against OEM values","Look for fretting marks, discolouration and spun races"],
   fix:["Metal-spray / sleeve the journal; bush or re-bore the housing; restore correct fits"],
   prev:["Verify fits with measurement at every bearing change and repair"] },

 { id:'shaftfatigue', name:"Shaft crack / fatigue failure", cat:"Mechanical", loc:['shaft'], leap:'rb',
   src:"General practice (torque, bending, misalignment)",
   why:"Cyclic bending or torsional loading (misalignment, unbalance, frequent starts, overhung loads) cracks the shaft at keyways or shoulders.",
   ev:{m_shaft:5,t_vib_2x:2,m_coupling:2,ctx_freqstart:2,t_vib_1x:1,ctx_realigned:1,ctx_loadchange:1,trip_start:1},
   confirm:["NDT (dye-penetrant / UT / MPI) of shaft; look for beach marks on fracture surface","Check run-out and alignment history"],
   fix:["Replace or repair the shaft; correct root cause (alignment, balance, loads)"],
   prev:["NDT on critical shafts at overhaul","Alignment and balance control"] },

 { id:'thrust', name:"Thrust-bearing overload (vertical motors)", cat:"Mechanical", loc:['bearing'], leap:'rb',
   src:"General practice for vertical pump motors",
   why:"Hydraulic up-thrust or down-thrust, low oil level or poor lubrication overload the thrust bearing of vertical motors, overheating the pads.",
   ev:{m_thrust:5,b_hot:3,trip_vib_temp:3,b_babbitt:2,ctx_loadchange:2,b_dry:2,b_cage:1},
   confirm:["Check thrust-pad temperature trend, oil level and oil cooler","Check pump operating point (flow, discharge pressure)"],
   fix:["Replace or re-metal thrust pads; correct oil level and cooling"],
   prev:["Operate pumps near best-efficiency point","Alarm on thrust-bearing temperature"] },

 /* ===== Terminal / core / protection / starter ===== */
 { id:'terminal', name:"Terminal-box / cable-termination failure or loose connection", cat:"Electrical", loc:['terminal'], leap:'basic',
   src:"General practice",
   why:"Loose lugs, poor crimps, damaged stress-cones or moisture in the terminal box cause hot spots, tracking and flash-over, leading to a phase fault with the winding itself healthy.",
   ev:{tb_flash:5,tb_hot:4,trip_sc:3,trip_ef:2,no_damage:2,ctx_humid:2,ctx_old:1,ctx_dust:1,ctx_corrosive:1,ctx_supply:1},
   confirm:["Inspect terminals, insulators, sealing and cable end-termination","Thermography of terminations while loaded; contact resistance"],
   fix:["Re-terminate cable, replace damaged insulators / gaskets, tighten to torque"],
   prev:["Annual termination thermography and torque check","Keep terminal-box seals intact"] },

 { id:'core', name:"Stator-core damage / lamination short (hot spots)", cat:"Electrical-Mechanical", loc:['core','stator'], leap:'prem',
   src:"ABB Digital EL-CID test",
   why:"Inter-laminar insulation breakdown or rotor rub allows eddy currents that create hot-spots, melt iron and damage winding insulation.",
   ev:{w_core:5,w_rubmark:3,ctx_old:2,c_blocked:1,t_cur_high:1,trip_ef:1,b_creep:1},
   confirm:["Digital EL-CID test (4 % flux) to locate faults","Visual inspection of core, back-of-iron and bore"],
   fix:["Repair laminations (chemical etching / re-insulation); replace core if severe"],
   prev:["EL-CID at major outages","Prevent rotor rubs (bearing wear)"] },

 { id:'eccentric', name:"Rotor eccentricity / non-uniform air-gap (rotor rubbing stator)", cat:"Mechanical", loc:['rotor','bearing','core','shaft'], leap:'rb',
   src:"HECO Part 2 (rotor-stator contact) / ABB MCSA & Vibration",
   why:"Worn bearings, bent shaft, soft foot or housing wear shift the rotor off-centre. Unequal magnetic pull and eventual rubbing damage rotor and stator.",
   ev:{w_rubmark:5,t_vib_2lf:3,t_vib_2x:2,b_creep:2,m_loose:2,m_shaft:2,t_vib_1x:2,b_noise:1,b_cage:1},
   confirm:["Vibration spectrum (2x line frequency) and MCSA eccentricity components","Measure air-gap at four points; check bearing clearance and shaft run-out"],
   fix:["Replace bearings, correct shaft / housing, repair rubbed core and rotor"],
   prev:["Bearing condition monitoring","Air-gap check at overhaul"] },

 { id:'starter', name:"Starter / contactor / fuse fault (LT motors)", cat:"Electrical", loc:['stator','terminal','none'], volt:['LT'], leap:'basic',
   src:"General practice",
   why:"A burnt contactor pole, blown fuse or loose power-circuit connection causes single-phasing or voltage drop to the motor, which then overheats.",
   ev:{ct_contactor:5,w_onephase:3,no_start_hum:3,trip_unb:2,t_cur_unb:2,tb_hot:2,trip_rep:1},
   confirm:["Inspect contactor tips and fuse bases; measure contact resistance and voltage drop","Check overload relay calibration"],
   fix:["Replace worn contactor / fuse; tighten terminals; replace / rewind motor if burnt"],
   prev:["Periodic starter inspection and thermography; replace contactors by operation count"] },

 { id:'protection', name:"Spurious trip: protection setting / control-circuit issue (motor healthy)", cat:"Protection", loc:['none'], leap:'basic',
   src:"General practice",
   why:"Wrong relay settings, CT or wiring problems, a faulty sensor or process interlock can trip a healthy motor.",
   ev:{no_damage:5,trip_ol:2,ctx_supply:2,trip_ef:1,trip_sc:1,trip_unb:1,trip_vib_temp:1,ct_contactor:1,ctx_loadchange:1},
   confirm:["Test IR/PI and winding resistance - if normal, suspect protection","Check relay settings, CT ratios, sensor (RTD / vibration probe) health, DCS interlocks and trip history"],
   fix:["Correct settings, repair CT / wiring / sensors; record the event in the relay log"],
   prev:["Periodic relay testing and coordination review"] },

 /* ===== DC machines (HECO Part 4) ===== */
 { id:'dccomm', name:"Commutator wear (DC motor)", cat:"Electrical-Mechanical", loc:['brush','rotor'], mt:['dc'], leap:'basic',
   src:"HECO Part 4",
   why:"Grooving, scoring and film loss from wear, dust or environment cause arcing, poor current transfer, overheating and uneven speed control.",
   ev:{dc_comm:5,dc_brush:2,r_speed:2,ctx_dust:3,t_cur_high:1,ctx_corrosive:1,ctx_humid:1},
   confirm:["Inspect commutator surface, bar-to-bar runout, mica undercut and film colour"],
   fix:["Turn and undercut the commutator; fit correct brush grade"],
   prev:["Regular inspection and cleaning; keep environment dust-free"] },

 { id:'dcbrush', name:"Brush-holder issues (DC motor)", cat:"Mechanical-Electrical", loc:['brush'], mt:['dc'], leap:'basic',
   src:"HECO Part 4",
   why:"Wrong spring tension or alignment, carbon build-up or tracking in the holder, wrong brush grade / length / shunts cause rapid brush wear, heat and commutator damage.",
   ev:{dc_brush:5,dc_comm:3,r_speed:2,ctx_dust:2,ctx_hot:1},
   confirm:["Check spring tension, brush alignment, brush length and holder cleanliness"],
   fix:["Clean holders, reset tension, replace worn parts and brushes with correct grade"],
   prev:["Periodic brush-gear checks and cleaning"] },

 { id:'dcfield', name:"Grounded field or interpole (DC motor)", cat:"Electrical", loc:['brush','stator','rotor'], mt:['dc'], leap:'basic',
   src:"HECO Part 4",
   why:"Moisture, contamination or overheating break down field / interpole insulation and cause earth faults.",
   ev:{dc_field:5,trip_ef:3,t_ir_low:3,ctx_idle:3,w_wet:2,ctx_humid:2,w_dirty:1},
   confirm:["Megger field and interpole circuits separately; check heater"],
   fix:["Dry out; repair or rewind the field / interpole coils"],
   prev:["Space heater in standby; keep motor clean and dry"] },
];

/* ---------------- Condition-assessment recommendations (from the ABB document) ---------------- */
const FA_LEAP = {
  basic:{ n:"LEAP Basic / routine checks", d:"Operational-history screening, IR/PI, visual inspection. No special machine requirements." },
  std:{ n:"LEAP Standard", d:"PDCA, tan-delta and capacitance, NLIBA, PD analysis and winding resistance. Motor offline, terminals disconnected, cooled to ambient; no dismantling except terminal box. Gives life estimate at about 80 % confidence." },
  adv:{ n:"LEAP Advanced", d:"All LEAP Standard tests plus visual inspection of overhang and slot exit (end covers opened) and PD localisation. Best before and after an overhaul." },
  rb:{ n:"LEAP Rotor & Bearings (MACHSense)", d:"Vibration spectrum, motor-current signature analysis and acoustic emission - run with the motor on load. Finds bearing, rotor-bar, eccentricity and lubrication problems early." },
  prem:{ n:"LEAP Premium (core + rotor)", d:"Full study including EL-CID core test, rotor and exciter checks; needs dismantling and rotor withdrawal." },
};

/* ---------------- UI state (kept across live refreshes) ---------------- */
const FA = { mt:'scim', volt:'HT', loc:'', brg:'', pick:'', unit:'', notes:'', tags:{}, result:null, showAll:false };

/* ---------------- Scoring engine ---------------- */
function faAnalyze(st){
  const sel = Object.keys(st.tags).filter(k => st.tags[k]);
  if(!sel.length) return null;
  const bgrp = st.loc === 'bearing_de' || st.loc === 'bearing_nde' ? 'bearing' : st.loc;
  const rows = [];
  FA_CAUSES.forEach(c => {
    if(c.mt && c.mt.indexOf(st.mt) < 0) return;
    if(c.volt && c.volt.indexOf(st.volt) < 0) return;
    if(c.brg && st.brg && c.brg !== st.brg) return;
    let raw = 0, matched = [], total = 0, miss = [];
    Object.keys(c.ev).forEach(k => {
      total += c.ev[k];
      if(st.tags[k]){ raw += c.ev[k]; matched.push([k, c.ev[k]]); }
      else if(c.ev[k] >= 3){ miss.push([k, c.ev[k]]); }
    });
    if(!matched.length) return;
    let f = 1;
    if(bgrp){ f = c.loc.indexOf(bgrp) >= 0 ? 1.3 : 0.55; }
    // a cause that explains only weak context hints must not outrank real physical evidence
    const strong = matched.filter(m => m[1] >= 3).length;
    if(!strong) f *= 0.5;
    const score = raw * f;
    rows.push({ c, score, raw, total, matched: matched.sort((a,b)=>b[1]-a[1]), miss: miss.sort((a,b)=>b[1]-a[1]), strong });
  });
  rows.sort((a,b) => b.score - a.score);
  const list = rows.filter(r => r.score >= 3);
  const top = list.length ? list[0].score : 0;
  list.forEach(r => {
    r.rel = Math.round(r.score / top * 100);
    r.level = r.score >= 14 ? 'High' : r.score >= 8 ? 'Medium' : 'Low';
  });
  let overall = 'Low';
  if(list.length){
    const second = list[1] ? list[1].score : 0;
    if(top >= 14 && top >= second * 1.25) overall = 'High';
    else if(top >= 9) overall = 'Medium';
  }
  return { list, overall, count: sel.length };
}

/* ---------------- Helpers ---------------- */
const faLocLabel = v => (FA_LOCS.filter(l => l[0] === v)[0] || ['', 'Not sure'])[1];
const faMtLabel = v => (FA_MACHINES.filter(l => l[0] === v)[0] || ['', v])[1];

function faSummaryText(res){
  const L = [];
  L.push('MOTOR FAILURE ANALYSIS - ' + (FA.volt) + ' motor, ' + faMtLabel(FA.mt));
  const eq = faPickedEquipment();
  if(eq) L.push('Equipment: ' + eq.name + (eq.serial ? ' (S.No ' + eq.serial + ')' : '') + (eq.where ? ' - ' + eq.where : ''));
  L.push('Failure location: ' + faLocLabel(FA.loc));
  L.push('Findings: ' + Object.keys(FA.tags).filter(k => FA.tags[k]).map(k => FA_LABEL[k]).join('; '));
  if(FA.notes) L.push('Notes: ' + FA.notes);
  L.push('');
  res.list.slice(0, 5).forEach((r, i) => {
    L.push((i+1) + '. ' + r.c.name + ' [' + r.level + ' likelihood]');
    L.push('   Confirm: ' + r.c.confirm.join('; '));
    L.push('   Action: ' + r.c.fix.join('; '));
  });
  L.push('');
  L.push('Indicative result from a rule-based tool; confirm by inspection and testing before deciding repair.');
  return L.join('\n');
}

function faPickedEquipment(){
  if(FA.pick === '' || typeof eqhEquipmentList !== 'function') return null;
  const list = faEquipList();
  return list[+FA.pick] || null;
}
function faEquipList(){
  if(typeof eqhEquipmentList !== 'function') return [];
  return eqhEquipmentList().filter(e => e.type === FA.volt)
    .sort((a,b) => String(a.name).localeCompare(String(b.name), undefined, {numeric:true, sensitivity:'base'}));
}

/* ---------------- Section renderer ---------------- */
function renderFailureAnalysis(main){
  const optHtml = (arr, sel) => arr.map(o => `<option value="${o[0]}" ${o[0]===sel?'selected':''}>${escapeHtml(o[1])}</option>`).join('');

  main.innerHTML = `
    <div class="section-head">
      <div><h2>${ICONS.diagnose} Motor Failure Analysis</h2>
        <div class="desc">Enter what was found on the failed HT / LT motor. The tool compares your findings with a knowledge base of motor failure modes (HECO "Why Motors Fail" series and ABB LEAP condition-assessment guide) and ranks the probable causes, with how to confirm each one and what to do about it.</div></div>
    </div>
    <div class="info-band">${ICONS.alert}<span>This is a guide to narrow down root cause, not a final verdict. Tick every finding you are reasonably sure about; leave doubtful ones blank. Confirm the top cause by inspection or testing before deciding repair or rewind.</span></div>

    <div class="form-card">
      <h3><span class="tagnum">A</span> Motor details</h3>
      <p class="hint">Voltage class and machine type decide which failure modes are relevant.</p>
      <div class="grid-3">
        <div class="f-item"><label>Motor class</label>
          <select class="sel" id="fa_volt"><option value="HT" ${FA.volt==='HT'?'selected':''}>HT motor</option><option value="LT" ${FA.volt==='LT'?'selected':''}>LT motor</option></select></div>
        <div class="f-item"><label>Machine type</label><select class="sel" id="fa_mt">${optHtml(FA_MACHINES, FA.mt)}</select></div>
        <div class="f-item"><label>Where did it fail? (main location)</label><select class="sel" id="fa_loc">${optHtml(FA_LOCS, FA.loc)}</select></div>
      </div>
      <div class="grid-3" style="margin-top:12px;">
        <div class="f-item"><label>Bearing type</label><select class="sel" id="fa_brg">${optHtml(FA_BRG, FA.brg)}</select></div>
        <div class="f-item"><label>Equipment (optional, from register)</label><select class="sel" id="fa_pick"></select></div>
        <div class="f-item"><label>Notes (optional)</label><input class="field" id="fa_notes" placeholder="e.g. ID Fan motor, tripped at 02:15" value="${escapeHtml(FA.notes)}"></div>
      </div>
    </div>

    <div class="form-card">
      <h3><span class="tagnum">B</span> Findings <span class="fa-count" id="faCount"></span></h3>
      <p class="hint">Tick everything observed. Results update instantly below.</p>
      ${FA_GROUPS.map(g => `
        <div class="fa-group"><div class="fa-group-title">${g.title}</div>
          <div class="fa-checks">
            ${g.tags.map(t => `<label class="fa-check"><input type="checkbox" data-tag="${t[0]}" ${FA.tags[t[0]]?'checked':''}><span>${escapeHtml(t[1])}</span></label>`).join('')}
          </div></div>`).join('')}
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="faReset" type="button">Clear all</button>
      </div>
    </div>
    <div id="faResult"></div>`;

  function fillPick(){
    const pick = $('#fa_pick', main);
    const list = faEquipList();
    pick.innerHTML = `<option value="">- Not selected -</option>` + list.map((e,i) => {
      const lbl = e.type === 'HT' ? `${e.name} - ${e.where||'-'}${e.serial?' - '+e.serial:''}` : `${e.name}${e.serial?' - '+e.serial:''} - ${e.where}`;
      return `<option value="${i}" ${String(i)===String(FA.pick)?'selected':''}>${escapeHtml(lbl)}</option>`;
    }).join('');
  }
  fillPick();

  function update(){
    $('#faCount', main).textContent = '(' + Object.keys(FA.tags).filter(k => FA.tags[k]).length + ' selected)';
    FA.result = faAnalyze(FA);
    drawResult();
  }

  $('#fa_volt', main).addEventListener('change', e => { FA.volt = e.target.value; FA.pick = ''; fillPick(); update(); });
  $('#fa_mt', main).addEventListener('change', e => { FA.mt = e.target.value; update(); });
  $('#fa_loc', main).addEventListener('change', e => { FA.loc = e.target.value; update(); });
  $('#fa_brg', main).addEventListener('change', e => { FA.brg = e.target.value; update(); });
  $('#fa_pick', main).addEventListener('change', e => { FA.pick = e.target.value; });
  $('#fa_notes', main).addEventListener('input', e => { FA.notes = e.target.value; });
  $$('[data-tag]', main).forEach(cb => cb.addEventListener('change', () => { FA.tags[cb.dataset.tag] = cb.checked; update(); }));
  $('#faReset', main).addEventListener('click', () => {
    FA.tags = {}; FA.showAll = false;
    $$('[data-tag]', main).forEach(cb => cb.checked = false);
    update();
  });

  /* ---------------- Result panel ---------------- */
  function drawResult(){
    const host = $('#faResult', main);
    const res = FA.result;
    if(!res){
      host.innerHTML = `<div class="form-card fa-empty">${ICONS.diagnose}<h4>Probable causes will appear here</h4><p>Tick at least one finding above.</p></div>`;
      return;
    }
    if(!res.list.length){
      host.innerHTML = `<div class="form-card fa-empty">${ICONS.alert}<h4>The findings do not point clearly to a known cause</h4><p>Add more observations (location, test results, history) or check that the motor class and machine type are correct.</p></div>`;
      return;
    }
    const shown = FA.showAll ? res.list.slice(0, 10) : res.list.slice(0, 5);
    const best = res.list[0];

    // Recommended condition-assessment packages (HT motors; for LT use IR/PI, surge test, vibration)
    const leapKeys = []; res.list.slice(0, 3).forEach(r => { if(leapKeys.indexOf(r.c.leap) < 0) leapKeys.push(r.c.leap); });
    const leapHtml = FA.volt === 'HT'
      ? `<div class="fa-leap"><h4>Recommended condition assessment (ABB LEAP)</h4>${leapKeys.map(k => `<div><b>${FA_LEAP[k].n}</b> - ${FA_LEAP[k].d}</div>`).join('')}</div>`
      : `<div class="fa-leap"><h4>Recommended checks for LT motors</h4><div>IR / PI test with megger, winding-resistance balance, surge test (if available), vibration and bearing-temperature check, thermography of terminals and starter. LEAP packages apply mainly to HT motors.</div></div>`;

    host.innerHTML = `
      <div class="form-card fa-top">
        <div class="fa-top-head">
          <div><div class="fa-kicker">Most probable cause</div><h3 class="fa-best">${escapeHtml(best.c.name)}</h3>
            <div class="fa-meta">${escapeHtml(best.c.cat)} - ${escapeHtml(best.c.src)}</div></div>
          <div class="fa-conf fa-${res.overall.toLowerCase()}"><small>Overall confidence</small><b>${res.overall}</b></div>
        </div>
        ${res.overall === 'Low' ? `<p class="hint" style="margin:10px 0 0;">Evidence is thin - tick more findings (especially test results and history) to sharpen the result.</p>` : ''}
        <div class="fa-actions fa-noprint">
          <button class="btn btn-primary btn-sm" id="faPrint" type="button">${ICONS.print} Print / Save PDF</button>
          <button class="btn btn-ghost btn-sm" id="faCopy" type="button">${ICONS.file} Copy summary</button>
          <button class="btn btn-amber btn-sm" id="faSave" type="button">${ICONS.plus} Save to Equipment History</button>
        </div>
      </div>
      ${shown.map((r, i) => causeCard(r, i)).join('')}
      ${res.list.length > 5 ? `<div class="fa-noprint" style="margin:0 0 16px;"><button class="btn btn-ghost btn-sm" id="faMore" type="button">${FA.showAll ? 'Show top 5 only' : 'Show more possible causes (' + (Math.min(10, res.list.length) - 5) + ')'}</button></div>` : ''}
      ${leapHtml}`;

    const more = $('#faMore', host);
    if(more) more.addEventListener('click', () => { FA.showAll = !FA.showAll; drawResult(); });
    $('#faPrint', host).addEventListener('click', () => window.print());
    $('#faCopy', host).addEventListener('click', () => {
      const text = faSummaryText(res);
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(() => toast('Summary copied.'), () => toast('Could not copy - select and copy manually.', true));
      } else {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try{ document.execCommand('copy'); toast('Summary copied.'); }catch(e){ toast('Could not copy.', true); }
        ta.remove();
      }
    });
    $('#faSave', host).addEventListener('click', () => requireEdit('save this analysis to Equipment History', () => openSaveModal(res)));
  }

  function causeCard(r, i){
    const c = r.c;
    const chips = (arr, cls) => arr.map(m => `<span class="fa-chip ${cls}">${escapeHtml(FA_LABEL[m[0]])}</span>`).join('');
    const missing = r.miss.slice(0, 5);
    return `
      <div class="form-card fa-cause ${i===0?'first':''}">
        <div class="fa-cause-head">
          <span class="fa-rank">${i+1}</span>
          <div style="flex:1;min-width:0;">
            <div class="fa-cause-name">${escapeHtml(c.name)}</div>
            <div class="fa-meta">${escapeHtml(c.cat)} - ${escapeHtml(c.src)}</div>
          </div>
          <span class="fa-badge fa-${r.level.toLowerCase()}">${r.level}</span>
        </div>
        <div class="fa-bar"><span style="width:${r.rel}%"></span></div>
        <p class="fa-why">${escapeHtml(c.why)}</p>
        <div class="fa-row"><b>Your findings that support this</b><div>${chips(r.matched, 'yes')}</div></div>
        ${missing.length ? `<div class="fa-row"><b>Also check - would strengthen or rule out</b><div>${chips(missing, 'chk')}</div></div>` : ''}
        <div class="fa-cols">
          <div><b>How to confirm</b><ul>${c.confirm.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
          <div><b>Corrective action</b><ul>${c.fix.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
          <div><b>Prevention</b><ul>${c.prev.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        </div>
      </div>`;
  }

  /* ---------------- Save to Equipment History ---------------- */
  function openSaveModal(res){
    const eq = faPickedEquipment();
    const best = res.list[0];
    const others = res.list.slice(1, 3).map(r => r.c.name).join('; ');
    const desc = 'Failure analysis (tool). Probable cause: ' + best.c.name + ' [' + res.overall + ' confidence]' +
      (others ? '. Other possibilities: ' + others : '') +
      '. Location: ' + faLocLabel(FA.loc) + '. Findings: ' +
      Object.keys(FA.tags).filter(k => FA.tags[k]).map(k => FA_LABEL[k]).join('; ') + '.' + (FA.notes ? ' Notes: ' + FA.notes : '');
    const unitGuess = eq && eq.units && eq.units.length === 1 ? 'Unit ' + eq.units[0] : '';
    openModal({
      title: 'Save analysis to Equipment History', submitLabel: 'Save entry', wide: true,
      bodyHtml: `
        <p class="hint" style="margin-bottom:10px;">Pick the equipment this analysis belongs to. It will be logged as a Breakdown / Fault event.</p>
        <div class="grid-2">
          <div class="f-item"><label>Equipment <span style="color:var(--safety-red);">*</span></label><select class="sel" id="fs_pick"></select></div>
          <div class="f-item"><label>Unit <span style="color:var(--safety-red);">*</span></label><select class="sel" id="fs_unit">${unitOptionsHtml(unitGuess)}</select></div>
        </div>
        <div class="f-item" style="margin-top:10px;"><label>Date</label><input class="field" type="date" id="fs_date" value="${todayISO()}"></div>
        <div class="f-item" style="margin-top:10px;"><label>Description (editable)</label><textarea class="field" id="fs_desc" rows="6">${escapeHtml(desc)}</textarea></div>`,
      onMount: ov => {
        const list = faEquipList();
        const p = ov.querySelector('#fs_pick');
        p.innerHTML = `<option value="">- Select equipment -</option>` + list.map((e,i) => `<option value="${i}" ${eq && e.name===eq.name && e.serial===eq.serial && e.where===eq.where ? 'selected':''}>${escapeHtml(e.name + (e.serial?' - '+e.serial:'') + (e.where?' - '+e.where:''))}</option>`).join('');
        p.addEventListener('change', () => {
          const e = list[+p.value];
          if(e && e.units && e.units.length === 1) ov.querySelector('#fs_unit').value = 'Unit ' + e.units[0];
        });
      },
      onSubmit: async ov => {
        const list = faEquipList();
        const item = list[+ov.querySelector('#fs_pick').value];
        const unit = ov.querySelector('#fs_unit').value;
        const description = ov.querySelector('#fs_desc').value.trim();
        if(!item){ toast('Select the equipment.', true); return false; }
        if(!unit){ toast('Select the unit.', true); return false; }
        if(!description){ toast('Description cannot be empty.', true); return false; }
        await cloudAddRecord(KEYS.equipHistory, { id: uid(), date: ov.querySelector('#fs_date').value || todayISO(), unit,
          equipType: item.type, equipment: item.name, serial: item.serial, source: item.where,
          event: 'Breakdown / Fault', description, doneBy: '', remark: 'Created from Failure Analysis tab' });
        toast('Saved to Equipment History.');
      }
    });
  }

  update();
}

/* ---------------- Self-registration (no changes to app.js required) ---------------- */
(function register(){
  if(typeof NAV === 'undefined' || typeof SECTION_RENDERERS === 'undefined') return;
  if(NAV.some(n => n.id === 'failure')) return;
  const item = { id:'failure', label:'Failure Analysis', icon:'diagnose', sub:[] };
  const at = NAV.findIndex(n => n.id === 'workshop');
  if(at >= 0) NAV.splice(at, 0, item); else NAV.push(item);
  DASH_META.failure = { desc:'Enter failure findings of an HT / LT motor and get ranked probable causes, confirmation tests and corrective actions', icon:'diagnose' };
  SECTION_RENDERERS.failure = main => renderFailureAnalysis(main);
})();
