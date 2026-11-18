# Game Brief — AETHERFORGE: Orbital Foundry

- **Genre**: Top-Down 2.5D Factory Automation & Logistics Sandbox
- **Platform**: Modern Web Browsers (Desktop Keyboard + Mouse, Static Vite Build)
- **Visual Direction**: Procedural 2.5D Dark Sci-Fi Industrial Vector Art (FICSIT Amber, Plasma Cyan, Basalt Slate, Zero Emoji Art)
- **Core Loop**: Mine mineral veins → Route ore along directional belts, underground tunnels, splitters, mergers, and inserters → Smelt and assemble multi-tier components → Balance day/night/coal/geothermal power & c^1.6 overclocking → Deliver cargo to the 3x3 Orbital Tether Hub to unlock 6 Tech Tiers and launch 5 Orbital Elevator Phases.
- **First Minute**:
  1. Boot directly into the Title Screen with `New Factory`, `Continue Save`, and 1-click `Demo Factory (Showcase)`.
  2. Upon starting a new factory, the 3x3 Orbital Hub sits at `(31,31)` with starter components in the global stockpile and iron/copper/coal/stone veins immediately visible nearby.
  3. Place a Miner Mk.I on Iron Ore, drag-draw Conveyor Belts into a Smelter and Constructor, and route plates back into any perimeter tile of the Orbital Hub.
- **Win / Fail States**:
  - **Soft Failure**: Power brownout scales machine and inserter speed proportionally (`satisfaction < 1.0`), never locking out recovery.
  - **Victory**: Completing all 5 Orbital Cargo Launch Phases triggers the Victory modal with full factory stats and a `Continue Megafactory` sandbox option.
- **Out of Scope**: Multiplayer netcode, enemy combat/biters, procedurally infinite chunk streaming beyond 64x64.
