const fs = require('fs'); 
const Parser = require("binary-parser").Parser;

console.log('Starting SCP parser...');
if (!process.argv[2]) {
    console.log('No file specified. Please call the script with the required file as the argument.');
    process.exit();
}
console.log(`Searching for ${process.argv[2]}`);

fs.readFile(process.argv[2], function (err, data) {
    if (err) {
        console.log(`Could not find file ${process.argv[2]}. Please make sure the file is in the same directory as this script and you have correctly entered the file name.`);
        process.exit();
    }
    console.log('File found!');

    const headerParser = new Parser()
        .endianess('little')
        .string('copyright', {
            zeroTerminated: true,
        })
        .uint32('animations')
        .uint32('unknown')
        .skip(8)
        .uint32('actions');
    const header = headerParser.parse(data);

    const individualActionParser = new Parser()
        .endianess('little')
        .uint32('actionID')
        .uint32('numScripts')
        .uint32('animation1')
        .uint32('animation2')
        .skip(4)
        .uint16('unknown')
        .uint16('sameAnimationModifier')
        .skip(4)
        .uint32('script');
    const actionParser = new Parser()
        .endianess('little')
        .skip(82) //skip header
        .array('actions', {
            type: individualActionParser,
            length: header.actions
        });
    const actions = actionParser.parse(data);

    const scriptDwordParser = new Parser()
        .endianess('little')
        .skip(82 + (header.actions * 32)) //skip header and actions
        .uint32('dwordCount');
    const scriptDwords = scriptDwordParser.parse(data);

    //this causes the wrong parameters
    const dwordParser = new Parser()
        .endianess('little')
        .array('bytes', {
            type: "uint8",
            length: 4,
        });
    const scriptParser = new Parser()
        .endianess('little')
        .skip(82 + (header.actions * 32) + 4) //skip header, actions, dword count
        .array('dwords', {
            type: dwordParser,
            length: scriptDwords.dwordCount,
        })
        .string('copyright', {
            zeroTerminated: true,
        });
    const script = scriptParser.parse(data);

    // console.log(header);
    // console.log(actions);
    // console.log(scriptDwords);
    // console.log(script.dwords);

    fs.writeFile('output.txt', parseResults(header, actions, scriptDwords, script), function(err) {
        if (err) {
            console.log('Error saving file');
            process.exit();
        }
        console.log('Output saved!');
    })

});

function parseResults(header, actions, scriptDwords, script) {
    return `
    ${process.argv[2]} output:

    HEADER:
    Number of animations: ${header.animations}
    Unknown value: ${header.unknown}
    Number of actions: ${header.actions}

    -----

    ACTIONS:${parseActions(actions)}
    -----

    SCRIPTS:
    Number of script dwords: ${scriptDwords.dwordCount}
    ${parseScripts(script)}
    `;
}

function parseActions(actions) {
    return actions.actions.map(function(action) {
        return `
    ID: ${action.actionID}
    Number of associated scripts: ${action.numScripts}
    Start animation: ${action.animation1}
    End animation: ${action.animation2}
    Unknown value: ${action.unknown}
    Same animation modifier: ${action.sameAnimationModifier}
    Script start point: ${action.script}
        `
    }).join('');
}

function parseScripts(script) {
    const scriptEnd = 99;
    let chunkedScripts = [];

    let sliceStart = 0;
    script.dwords.forEach(function (dword, index) {
        if (dword.bytes[0] === scriptEnd) {
            chunkedScripts.push(script.dwords.slice(sliceStart, index + 1));
            sliceStart = index + 1;
        }
    });  

    let dwordTotal = 0;
    let parsedScripts = chunkedScripts.map(function(script) {
        let string = `
    Script start position: ${dwordTotal}
    Script dword count: ${script[0].bytes[0]}
    Commands:
    ${parseIndividualScript(script.slice(1))}
        `
        dwordTotal += script[0].bytes[0];
        return string;
    }).join('');

    return parsedScripts;
}

function parseIndividualScript(script) {
    const commandEnd = 64;
    let chunkedCommands = [];

    script.forEach(function (dword, index) {
        if (dword.bytes[3] === commandEnd) {
            command = [dword]
            let commandDone = false;
            let pos = index + 1
            while (!commandDone) {
                if (script[pos] && script[pos].bytes[3] !== commandEnd) {
                    command.push(script[pos])
                    pos++;
                } else {
                    commandDone = true;
                }
            }
            chunkedCommands.push(command);
        }
    });

    let parsedScript = chunkedCommands.map(function(command) {
        let list = [];
        for (var i = 0; i < command.length; i++) {
            if (i === 0) {
                // get the verb
                list.push(`${toHexString(command[i].bytes[0])}: ${scpVerbs[toHexString(command[i].bytes[0])]}`);
            } else {
                // get the params
                if (callsFudger.includes(scpVerbs[toHexString(command[0].bytes[0])]) && i === 1) {
                    // if fudger and first param, show fudger name
                    list.push(` ${fudgers[toHexString(command[i].bytes[0])]}`);
                } else if (scpVerbs[toHexString(command[0].bytes[0])] === 'cueCode1' && i === 1) {
                    // if cue code, show cue code name
                    list.push(` ${cueCodes[toHexString(command[i].bytes[0])]}`);
                } else {
                    // else show param as hex number
                    list.push(` ${toHexString(command[i].bytes[0])}`);
                }
            }
        }
        return list;
    }).join('\n\t');
    return parsedScript;
}

function leftPad(string) {
    if (string.length === 1) {
        string = `0${string}`;
    }
    return string
}

function toHexString(value) {
    return leftPad(value.toString(16).toUpperCase());
}

const scpVerbs = {
    '00': 'startPos',
    '01': 'actionDone0',
    '02': 'actionStart1',
    '03': 'alignScripts0',
    '04': 'alignBallToPtSetup3',
    '05': 'alignBallToPtGo0',
    '06': 'alignBallToPtStop0',
    '07': 'alignFudgeBallToPtSetup2',
    '08': 'blendToFrame3',
    '09': 'cueCode1',
    '0A': 'debugCode1',
    '0B': 'disableFudgeAim1',
    '0C': 'disableSwing0',
    '0D': 'doneTalking0',
    '0E': 'doneTalking1',
    '0F': 'enableFudgeAim1',
    '10': 'enableSwing1',
    '11': 'endBlock0',
    '12': 'endBlockAlign0',
    '13': 'glueScripts0',
    '14': 'glueScriptsBall1',
    '15': 'interruptionsDisable0',
    '16': 'interruptionsEnable0',
    '17': 'lookAtLocation2',
    '18': 'lookAtLocationEyes2',
    '19': 'lookAtRandomPt0',
    '1A': 'lookAtRandomPtEyes0',
    '1B': 'lookAtSprite1',
    '1C': 'lookAtSpriteEyes1',
    '1D': 'lookAtUser0',
    '1E': 'lookForward0',
    '1F': 'lookForwardEyes0',
    '20': 'null0',
    '21': 'null1',
    '22': 'null2',
    '23': 'null3',
    '24': 'null4',
    '25': 'null5',
    '26': 'null6',
    '27': 'playAction2',
    '28': 'playActionRecall2',
    '29': 'playActionStore2',
    '2A': 'playLayeredAction3',
    '2B': 'playLayeredAction4',
    '2C': 'playLayeredActionCallback5',
    '2D': 'playLayeredActionCallback6',
    '2E': 'playTransitionToAction1',
    '2F': 'rand2',
    '30': 'resetFudger1',
    '31': 'resumeFudging1',
    '32': 'resumeLayerRotation1',
    '33': 'sequence2',
    '34': 'sequenceToEnd1',
    '35': 'sequenceToStart1',
    '36': 'setBlendOffset3',
    '37': 'setFudgeAimDefaults5',
    '38': 'setFudgerDrift2',
    '39': 'setFudgerRate2',
    '3A': 'setFudgerTarget2',
    '3B': 'setFudgerNow2',
    '3C': 'setHeadTrackAcuteness',
    '3D': 'setHeadTrackMode1',
    '3E': 'setLayeredBaseFrame2',
    '3F': 'setMotionScale1',
    '40': 'setMotionScale2',
    '41': 'setReverseHeadTrack1',
    '42': 'setRotationPivotBall1',
    '43': 'soundEmptyQueue0',
    '44': 'soundLoop1',
    '45': 'soundSetPan1',
    '46': 'soundPlay1',
    '47': 'soundPlay2',
    '48': 'soundPlay3',
    '49': 'soundPlay4',
    '4A': 'soundPlay5',
    '4B': 'soundQueue1',
    '4C': 'soundQueue2',
    '4D': 'soundQueue3',
    '4E': 'soundQueue4',
    '4F': 'soundQueue5',
    '50': 'soundSetDefltVocPitch1',
    '51': 'soundSetPitch1',
    '52': 'soundSetVolume1',
    '53': 'soundStop0',
    '54': 'startListening0',
    '55': 'startBlockLoop1',
    '56': 'startBlockCallback2',
    '57': 'startBlockChance1',
    '58': 'startBlockDialogSynch0',
    '59': 'startBlockElse0',
    '5A': 'startBlockListen0',
    '5B': 'stopFudging1',
    '5C': 'suspendFudging1',
    '5D': 'suspendLayerRotation1',
    '5E': 'tailSetNeutral1',
    '5F': 'tailSetRestoreNeutral1',
    '60': 'tailSetWag1',
    '61': 'targetSprite4',
    '62': 'throwMe0',
    '63': 'endPos',
}

const callsFudger = [
    'alignFudgeBallToPtSetup2',
    'disableFudgeAim1',
    'enableFudgeAim1',
    'resetFudger1',
    'resumeFudging1',
    'setFudgeAimDefaults5',
    'setFudgerDrift2',
    'setFudgerRate2',
    'setFudgerTarget2',
    'setFudgerNow2',
    'stopFudging1',
    'suspendFudging1',
]

const fudgers = {
    '00': 'rotation',
    '01': 'roll',
    '02': 'tilt',
    '03': 'headRotation',
    '04': 'headTilt',
    '05': 'headCock',
    '06': 'rEyelidHeight',
    '07': 'lEyelidHeight',
    '08': 'rEyelidTilt',
    '09': 'lEyelidTilt',
    '0A': 'eyeTargetX',
    '0B': 'eyeTargetY',
    '0C': 'XTrans',
    '0D': 'YTrans',
    '0E': 'scaleX',
    '0F': 'scaleY',
    '10': 'scaleZ',
    '11': 'ballScale',
    '12': 'masterScale',
    '13': 'rEyeSizeXXX',
    '14': 'lEyeSizeXXX',
    '15': 'rArmSizeXXX',
    '16': 'lArmSizeXXX',
    '17': 'rLegSizeXXX',
    '18': 'lLegSizeXXX',
    '19': 'rHandSizeXXX',
    '1A': 'lHandSizeXXX',
    '1B': 'rFootSizeXXX',
    '1C': 'lFootSizeXXX',
    '1D': 'headSizeXXX',
    '1E': 'bodyExtend',
    '1F': 'frontLegExtend',
    '20': 'hindLegExtend',
    '21': 'faceExtend',
    '22': 'headEnlarge',
    '23': 'headEnlargeBalance',
    '24': 'earExtend',
    '25': 'footEnlarge',
    '26': 'footEnlargeBalance',
    '27': 'preRotation',
    '28': 'preRoll',
    '29': 'addBallz0',
    '2A': 'addBallzFlower1',
    '2B': 'addBallzHeart2',
    '2C': 'addBallzQuestion3',
    '2D': 'addBallzExclamation4',
    '2E': 'addBallzLightBulbOff5',
    '2F': 'addBallzStickMan6',
    '30': 'addBallzCrossbones7',
    '31': 'addBallzLightning8',
    '32': 'addBallzBrokenHeart9',
    '33': 'addBallzSnowOne10',
    '34': 'addBallzSnowTwo11',
    '35': 'addBallzSnowThree12',
    '36': 'addBallzLightBulbOn13',
    '37': 'addBallzTears14',
    '38': 'addBallzOddLove15',
    '39': 'morph',
    '3A': 'bothEyelidHeights',
    '3B': 'bothEyelidTilts',
    '3C': 'bothEyeSizes',
    '3D': 'bothArmSizes',
    '3E': 'bothLegSizes',
    '3F': 'rightLimbSizes',
    '40': 'leftLimbSizes',
    '41': 'allLimbSizes',
    '42': 'bothHandSizes',
    '43': 'bothFeetSizes',
    '44': 'rightDigitSizes',
    '45': 'leftDigitSizes',
    '46': 'allDigitSizes',
    '47': 'allFudgers',
}

const cueCodes = {
    '00': 'introDone',
    '01': 'introNotDone',
    '02': 'grabObject',
    '03': 'releaseObject',
    '04': 'lookAtInterest',
    '05': 'lookAtInteractor',
    '06': 'useObject',
    '07': 'swatObject',
    '08': 'gnawObject',
    '09': 'scratchObject',
    '0A': 'digHole',
    '0B': 'fillHole',
    '0C': 'trip',
    '0D': 'snoreActive',
    '0E': 'snoreIn',
    '0F': 'snoreOut',
    '10': 'snoreDream',
    '11': 'ateFood',
    '12': 'scare',
    '13': 'stepHandL',
    '14': 'stepHandR',
    '15': 'stepFootL',
    '16': 'stepFootR',
    '17': 'stompHandL',
    '18': 'stompHandR',
    '19': 'stompFootL',
    '1A': 'stompFootR',
    '1B': 'land',
    '1C': 'scuff',
    '1D': 'showLinez',
    '1E': 'hideLinez',
    '1F': 'NONE',
    '20': 'cursor',
    '21': 'shelf',
    '22': 'otherPet',
    '23': 'focusSprite1',
    '24': 'focusSprite2',
    '25': 'focusSprite3',
    '26': 'percentChance',
    '27': 'ifSoundAdult',
    '28': 'isAdoptionKit',
}
