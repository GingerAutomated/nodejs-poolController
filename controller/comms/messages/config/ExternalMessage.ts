﻿import { Inbound } from "../Messages";
import { sys, Feature, Body, ICircuitGroup, LightGroup } from"../../../Equipment";
import { state, BodyTempState, ICircuitGroupState, LightGroupState } from "../../../State";
import { setTimeout } from "timers";
export class ExternalMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(0)) {
            case 0: // Setpoints/HeatMode
                ExternalMessage.processTempSettings(msg);
                break;
            case 1: // Circuit Changes
                ExternalMessage.processCircuit(msg);
                break;
            case 2: // Unkown
                break;
            case 3: // Schedule Changes
                ExternalMessage.processSchedules(msg);
                break;
            case 4: // Pump Information
                ExternalMessage.processPump(msg);
                break;
            case 5: // Unknown
                break;
            case 6: // Light/Circuit group
                ExternalMessage.processGroupSettings(msg);
                break;
            case 7: // Chlorinator
                ExternalMessage.processChlorinator(msg);
                break;
            case 8: // Unknown
                break;
            case 9: // Valves
                break;
            case 10: // Heaters
                ExternalMessage.processHeater(msg);
                break;
            case 11: // Unknown
                break;
            case 12: // Pool Settings Alias, owner...etc.
                break;
            case 13: // Bodies (Manual heat, capacities)
                ExternalMessage.processBodies(msg);
                break;
            case 14:
                break;
            case 15: // Circuit, feature, group, and schedule States
                ExternalMessage.processCircuitState(3, msg);
                ExternalMessage.processFeatureState(9, msg);
                ExternalMessage.processScheduleState(15, msg);
                ExternalMessage.processCircuitGroupState(13, msg);
                break;
        }
    }
    public static processGroupSettings(msg: Inbound) {
        // We have 3 potential messages.
        let groupId = msg.extractPayloadByte(2) + sys.board.equipmentIds.circuitGroups.start;
        let group: ICircuitGroup = null;
        let sgroup: ICircuitGroupState = null;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                // Get the type.
                let type = msg.extractPayloadByte(3);
                switch (msg.extractPayloadByte(3)) {
                    case 0:
                        group = sys.circuitGroups.getInterfaceById(groupId);
                        sgroup = group.type === 2 ? state.circuitGroups.getItemById(groupId) : state.lightGroups.getItemById(groupId);
                        sys.lightGroups.removeItemById(groupId);
                        sys.circuitGroups.removeItemById(groupId);
                        state.lightGroups.removeItemById(groupId);
                        sys.circuitGroups.removeItemById(groupId);
                        sgroup.isActive = false;
                        state.emitEquipmentChanges();
                        break;
                    case 1:
                        group = sys.lightGroups.getItemById(groupId, true);
                        sgroup = state.lightGroups.getItemById(groupId, true);
                        sgroup.lightingTheme = group.lightingTheme = msg.extractPayloadByte(4) >> 2;
                        sgroup.type = group.type = type;
                        sgroup.isActive = group.isActive = true;
                        break;
                    case 2:
                        group = sys.circuitGroups.getItemById(groupId, true);
                        sgroup = state.circuitGroups.getItemById(groupId, true);
                        sgroup.type = group.type = type;
                        sgroup.isActive = group.isActive = true;
                        break;
                }
                if (group.isActive) {
                    for (let i = 0; i < 16; i++) {
                        let circuitId = msg.extractPayloadByte(i + 6);
                        let circuit = group.circuits.getItemByIndex(i, circuitId !== 255);
                        if (circuitId === 255) group.circuits.removeItemByIndex(i);
                        circuit.circuit = circuitId + 1;
                    }
                }
                group.eggTimer = (msg.extractPayloadByte(38) * 60) + msg.extractPayloadByte(39);
                sgroup.eggTimer = group.eggTimer;
                if (type === 1) {
                    let g = group as LightGroup;
                    for (let i = 0; i < 16; i++) {
                        g.circuits.getItemByIndex(i).swimDelay = msg.extractPayloadByte(22 + i);
                    }
                }
                state.emitEquipmentChanges();
                break;
            case 1:
                group = sys.circuitGroups.getInterfaceById(groupId);
                sgroup = group.type === 1 ? state.lightGroups.getItemById(groupId) : state.circuitGroups.getItemById(groupId);
                sgroup.name = group.name = msg.extractPayloadString(19, 16);
                if (group.type === 1) {
                    let g = group as LightGroup;
                    for (let i = 0; i < 16; i++) {
                        let circuit = g.circuits.getItemByIndex(i);
                        circuit.color = msg.extractPayloadByte(i + 3);
                    }
                }
                state.emitEquipmentChanges();
                break;
            case 2:
                break;
        }
    }
    public static processIntelliCenterState(msg) {
        ExternalMessage.processCircuitState(2, msg);
        ExternalMessage.processFeatureState(8, msg);
        ExternalMessage.processScheduleState(14, msg);
        ExternalMessage.processCircuitGroupState(12, msg);

    }
    private static processHeater(msg: Inbound) {
        // So a user is changing the heater info.  Lets
        // hijack it and get it ourselves.
        let heater = sys.heaters.getItemById(msg.extractPayloadByte(2));
        heater.efficiencyMode = msg.extractPayloadByte(27);
        heater.type = msg.extractPayloadByte(3);
        heater.address = msg.extractPayloadByte(10);
        heater.name = msg.extractPayloadString(11, 16);
        heater.body = msg.extractPayloadByte(4);
        heater.differentialTemp = msg.extractPayloadByte(5);
        heater.coolingEnabled = msg.extractPayloadByte(8) > 0;
        heater.economyTime = msg.extractPayloadByte(29);
        if (heater.type === 0) sys.heaters.removeItemById(heater.id);
        // Check anyway to make sure we got it all.
        //setTimeout(() => sys.checkConfiguration(), 500);
    }
    
    private static processCircuitState(start: number, msg: Inbound) {
        let circuitId = sys.board.equipmentIds.circuits.start;
        let body = 0; // Off
        for (let i = start; i < msg.payload.length && sys.board.equipmentIds.circuits.isInRange(circuitId); i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                let circuit = sys.circuits.getItemById(circuitId);
                let cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                if (circuit.isActive) {
                    cstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                    cstate.name = circuit.name;
                    cstate.showInFeatures = circuit.showInFeatures;
                    cstate.type = circuit.type;
                    if (cstate.isOn && circuit.type === 12) body = 6;
                    if (cstate.isOn && circuit.type === 13) body = 1;
                    switch (circuit.type) {
                        case 6: // Globrite
                        case 5: // Magicstream
                        case 8: // Intellibrite
                        case 10: // Colorcascade
                            cstate.lightingTheme = circuit.lightingTheme;
                            break;
                        case 9: // Dimmer
                            cstate.level = circuit.level;
                            break;
                    }
                }
                else
                    state.circuits.removeItemById(circuitId);
                state.emitEquipmentChanges();
                circuitId++;
            }
        }
        state.body = body;
    }
    private static processScheduleState(start: number, msg: Inbound) {
        let scheduleId = 1;
        for (let i = start; i < msg.payload.length && scheduleId <= sys.equipment.maxSchedules; i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the schedule identified by each value.
            for (let j = 0; j < 8; j++) {
                let schedule = sys.schedules.getItemById(scheduleId);
                if (schedule.isActive) {
                    if (schedule.circuit > 0) { // Don't get the schedule state if we haven't determined the entire config for it yet.
                        let sstate = state.schedules.getItemById(scheduleId, schedule.isActive);
                        sstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                        sstate.circuit = schedule.circuit;
                        sstate.endTime = schedule.endTime;
                        sstate.startDate = schedule.startDate;
                        sstate.startTime = schedule.startTime;
                        sstate.scheduleDays = schedule.scheduleDays;
                        sstate.scheduleType = schedule.runOnce & 128 ? 128 : 0;
                        sstate.heatSetpoint = schedule.heatSetpoint;
                        sstate.heatSource = schedule.heatSource;
                    }
                }
                else
                    state.schedules.removeItemById(scheduleId);
                scheduleId++;
            }
        }
        state.emitEquipmentChanges();
    }
    private static processFeatureState(start: number, msg: Inbound) {
        let featureId = sys.board.equipmentIds.features.start;
        for (let i = start; i < msg.payload.length && sys.board.equipmentIds.features.isInRange(featureId); i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the feature identified by each value.
            for (let j = 0; j < 8; j++) {
                let feature = sys.features.getItemById(featureId);
                let fstate = state.features.getItemById(featureId, feature.isActive);
                if (feature.isActive) {
                    fstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                    fstate.name = feature.name;
                }
                else
                    state.features.removeItemById(featureId);
                featureId++;
            }
        }
        state.emitEquipmentChanges();
    }
    private static processCircuitGroupState(start: number, msg: Inbound) {
        let groupId = sys.board.equipmentIds.circuitGroups.start;
        for (let i = start; i < msg.payload.length && sys.board.equipmentIds.circuitGroups.isInRange(groupId); i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the group identified by each value.
            for (let j = 0; j < 8; j++) {
                let group = sys.circuitGroups.getInterfaceById(groupId);

                let gstate = group.type == 1 ? state.lightGroups.getItemById(groupId, group.isActive) : state.circuitGroups.getItemById(groupId, group.isActive);
                if (group.isActive) {
                    gstate.isOn = ((byte & (1 << (j))) >> j) > 0;
                    gstate.name = group.name;
                    gstate.type = group.type;
                    // Now calculate out the sync/set/swim operations.
                    if (gstate.dataName === 'lightGroup') {
                        let lg = gstate as LightGroupState;
                        let ndx = lg.id - sys.board.equipmentIds.circuitGroups.start;
                        let byteNdx = Math.ceil(ndx / 4);
                        let bitNdx = (((byteNdx * 4) - ndx) * 2);
                        let byte = msg.extractPayloadByte(start + 15 + byteNdx, 255);
                        byte = ((byte >> bitNdx) & 0x0003);
                        //byte = (~((byte >> bitNdx) & 3) & 3);
                        //console.log({ byte: byte, raw: msg.extractPayloadByte(start + 15 + byteNdx, 255), ndx: ndx, byteNdx: byteNdx, bitNdx: bitNdx });
                        switch (byte) {
                            case 0: // Sync
                                lg.action = 1;
                                break;
                            case 1: // Color swim
                                lg.action = 3
                                break;
                            case 2: // Color set
                                lg.action = 2;
                                break;
                            default:
                                lg.action = 0;
                                break;
                        }
                    }
                }
                else {
                    state.circuitGroups.removeItemById(groupId);
                    state.lightGroups.removeItemById(groupId);
                }
                groupId++;
            }
        }
        state.emitEquipmentChanges();
    }

    private static processBodies(msg: Inbound) {
        let bodyId = 0;
        let cbody: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0:
            case 1:
            case 2:
            case 3:
                bodyId = msg.extractPayloadByte(2);
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                cbody.name = msg.extractPayloadString(3, 16);
                state.temps.bodies.getItemById(bodyId, false).name = cbody.name;
                break;
            case 4:
            case 5:
            case 6:
            case 7:
                bodyId = msg.extractPayloadByte(2) - 4;
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                cbody.capacity = msg.extractPayloadByte(3) * 1000;
                break;
            case 13: // Pump notifications
                break;
            case 14: // Heater notifications
                break;
            case 15: // Chlorinator notifications
                break;
        }
        state.emitEquipmentChanges();
    }
    private static processSchedules(msg: Inbound) {
        let schedId = msg.extractPayloadByte(2) + 1;
        let cfg = sys.schedules.getItemById(schedId);
        cfg.startTime = msg.extractPayloadInt(3);
        cfg.endTime = msg.extractPayloadInt(5);
        cfg.circuit = msg.extractPayloadByte(7) + 1;
        cfg.runOnce = msg.extractPayloadByte(8);
        cfg.scheduleDays = msg.extractPayloadByte(9);
        cfg.startMonth = msg.extractPayloadByte(10);
        cfg.startDay = msg.extractPayloadByte(11);
        cfg.startYear = msg.extractPayloadByte(12);
        cfg.heatSource = msg.extractPayloadByte(13);
        cfg.heatSetpoint = msg.extractPayloadByte(14);
        cfg.flags = msg.extractPayloadByte(15);
        if (cfg.circuit > 0 && cfg.isActive && cfg.startTime > 0) {
            let s = state.schedules.getItemById(schedId);
            s.startTime = cfg.startTime;
            s.endTime = cfg.endTime;
            s.circuit = cfg.circuit;
            s.scheduleType = cfg.runOnce;
            s.scheduleDays = ((cfg.runOnce & 128) > 0) ? cfg.scheduleDays : cfg.runOnce;
            s.heatSetpoint = cfg.heatSetpoint;
            s.heatSource = cfg.heatSource;
            s.startDate = cfg.startDate;
        }
        else {
            sys.schedules.removeItemById(cfg.id);
            state.schedules.removeItemById(cfg.id);
        }
        state.emitEquipmentChanges();
    }

    private static processChlorinator(msg: Inbound) {
        let chlorId = msg.extractPayloadByte(2) + 1;
        let cfg = sys.chlorinators.getItemById(chlorId);
        let s = state.chlorinators.getItemById(chlorId);
        cfg.body = msg.extractPayloadByte(3);
        cfg.poolSetpoint = msg.extractPayloadByte(5);
        cfg.spaSetpoint = msg.extractPayloadByte(6);
        cfg.superChlor = msg.extractPayloadByte(7) > 0;
        cfg.superChlorHours = msg.extractPayloadByte(8);
        s.poolSetpoint = cfg.poolSetpoint;
        s.spaSetpoint = cfg.spaSetpoint;
        s.superChlorHours = cfg.superChlorHours;
        s.body = cfg.body;
        state.emitEquipmentChanges();
    }
    private static processPump(msg: Inbound) {
        let pumpId = msg.extractPayloadByte(2) + 1;
        if (msg.extractPayloadByte(1) === 0) {
            let type = msg.extractPayloadByte(3);
            let cpump = sys.pumps.getItemById(pumpId, type > 0);
            let spump = state.pumps.getItemById(pumpId, type > 0);
            cpump.type = type;
            spump.type = type;
            if (cpump.type > 2) {
                cpump.address = msg.extractPayloadByte(5);
                cpump.minSpeed = msg.extractPayloadInt(6);
                cpump.maxSpeed = msg.extractPayloadInt(8);
                cpump.minFlow = msg.extractPayloadByte(10)
                cpump.maxFlow = msg.extractPayloadByte(11);
                cpump.flowStepSize = msg.extractPayloadByte(12);
                cpump.primingSpeed = msg.extractPayloadInt(13);
                cpump.speedStepSize = msg.extractPayloadByte(15) * 10;
                cpump.primingTime = msg.extractPayloadByte(16);
                cpump.circuits.clear()
                for (let i = 18; i < msg.payload.length && i <= 25; i++)
                {
                    let circuitId = msg.extractPayloadByte(i);
                    if (circuitId !== 255) {
                        let circuit = cpump.circuits.getItemById(i - 17, true);
                        circuit.circuit = circuitId + 1;
                        circuit.units = msg.extractPayloadByte(i + 8);
                    }
                }
            }
            else if (cpump.type === 1) {
                cpump.circuits.clear();
                cpump.circuits.add({ id: 1, body: msg.extractPayloadByte(18) });
            }
            if (cpump.type === 0) {
                sys.pumps.removeItemById(cpump.id);
                state.pumps.removeItemById(cpump.id);
            }
        }
        else if (msg.extractPayloadByte(1) === 1) {
            let cpump = sys.pumps.getItemById(pumpId);
            let spump = state.pumps.getItemById(pumpId);
            cpump.name = msg.extractPayloadString(19, 16);
            spump.name = cpump.name;
            if (cpump.type > 2) {
                for (let i = 3, circuitId = 1; i < msg.payload.length && i <= 18; circuitId++) {
                    let circuit = cpump.circuits.getItemById(circuitId);
                    let sp = msg.extractPayloadInt(i);
                    if (sp < 450)
                        circuit.flow = sp;
                    else
                        circuit.speed = sp;
                    i += 2;
                }
            }
            spump.emitData('pumpExt', spump.getExtended()); // Do this so clients can delete them.
        }
    }
    private static processCircuit(msg: Inbound) {
        let circuitId = msg.extractPayloadByte(2) + 1;
        let circuit = sys.circuits.getItemById(circuitId, false);
        let cstate = state.circuits.getItemById(circuitId, false);
        circuit.showInFeatures = msg.extractPayloadByte(5) > 0;
        circuit.freeze = msg.extractPayloadByte(4) > 0;
        circuit.name = msg.extractPayloadString(10, 16);
        circuit.type = msg.extractPayloadByte(3);
        circuit.eggTimer = (msg.extractPayloadByte(7) * 60) + msg.extractPayloadByte(8);
        circuit.showInFeatures = msg.extractPayloadByte(5) > 0;
        cstate.type = circuit.type;
        cstate.showInFeatures = circuit.showInFeatures;
        cstate.name = circuit.name;
        switch (circuit.type) {
            case 5:
            case 6:
            case 8:
                circuit.lightingTheme = msg.extractPayloadByte(6);
                cstate.lightingTheme = circuit.lightingTheme;
                break;
            case 9:
                circuit.level = msg.extractPayloadByte(6);
                cstate.level = circuit.level;
                break;
        }
        state.emitEquipmentChanges();
    }
    private static processTempSettings(msg: Inbound) {
        // What the developers did is supply an offset index into the payload for the byte that is
        // changing.  I suppose this may have been easier but we are not using that logic.  We want the
        // information to remain decoded so that we aren't guessing which byte does what.
        // payLoadIndex = byte(2) + 3 where the first 3 bytes indicate what value changed.
        let body: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0: // Water Sensor 2 Adj
                sys.general.options.waterTempAdj2 = (msg.extractPayloadByte(3) & 0x007F) * (((msg.extractPayloadByte(3) & 0x0080) > 0) ? -1 : 1);
                break;
            case 1: // Water Sensor 1 Adj
                sys.general.options.waterTempAdj1 = (msg.extractPayloadByte(4) & 0x007F) * (((msg.extractPayloadByte(4) & 0x0080) > 0) ? -1 : 1);
                break;
            case 2: // Solar Sensor 1 Adj
                sys.general.options.solarTempAdj1 = (msg.extractPayloadByte(5) & 0x007F) * (((msg.extractPayloadByte(5) & 0x0080) > 0) ? -1 : 1);
                break;
            case 3: // Air Sensor Adj
                sys.general.options.airTempAdj = (msg.extractPayloadByte(6) & 0x007F) * (((msg.extractPayloadByte(6) & 0x0080) > 0) ? -1 : 1);
                break;
            case 5:
                sys.general.options.solarTempAdj2 = (msg.extractPayloadByte(7) & 0x007F) * (((msg.extractPayloadByte(7) & 0x0080) > 0) ? -1 : 1);
                break;
            case 18: // Body 1 Setpoint
                body = sys.bodies.getItemById(1, false);
                body.setPoint = msg.extractPayloadByte(21);
                state.temps.bodies.getItemById(1).setPoint = body.setPoint;
                state.emitEquipmentChanges();
                break;
            case 19: // Body 3 Setpoint
                body = sys.bodies.getItemById(3, false);
                body.setPoint = msg.extractPayloadByte(22);
                state.temps.bodies.getItemById(3).setPoint = body.setPoint;
                state.emitEquipmentChanges();
                break;
            case 20: // Body 2 Setpoint
                body = sys.bodies.getItemById(2, false);
                body.setPoint = msg.extractPayloadByte(23);
                state.temps.bodies.getItemById(2).setPoint = body.setPoint;
                state.emitEquipmentChanges();
                break;
            case 21: // Body 4 Setpoint
                body = sys.bodies.getItemById(4, false);
                body.setPoint = msg.extractPayloadByte(24);
                state.temps.bodies.getItemById(4).setPoint = body.setPoint;
                state.emitEquipmentChanges();
                break;
            case 22: // Body 1 Heat Mode
                body = sys.bodies.getItemById(1, false);
                body.heatMode = msg.extractPayloadByte(25);
                state.temps.bodies.getItemById(1).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                break;
            case 23: // Body 2 Heat Mode
                body = sys.bodies.getItemById(2, false);
                body.heatMode = msg.extractPayloadByte(26);
                state.temps.bodies.getItemById(2).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                break;
            case 24: // Body 3 Heat Mode
                body = sys.bodies.getItemById(3, false);
                body.heatMode = msg.extractPayloadByte(27);
                state.temps.bodies.getItemById(3).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                break;
            case 25: // Body 4 Heat Mode
                body = sys.bodies.getItemById(4, false);
                body.heatMode = msg.extractPayloadByte(28);
                state.temps.bodies.getItemById(4).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                break;
        }
    }
}