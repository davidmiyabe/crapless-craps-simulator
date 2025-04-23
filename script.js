/* Neon Crapless Craps Simulator Code */

// GLOBAL VARIABLES
let initialCash = 500;           // Starting cash for the player
let freeCash = initialCash;      // Cash available for betting (wagers deducted immediately)
let betAmount = 10;
let betAmounts = {};             // Base bets: Pass Line and Place bets
let oddsBets = {};               // Odds for Place bets (if used)
let comeBets = {};               // Come bets assigned to numbers (one-roll bets)
let comeOddsBets = {};           // Odds on Come bets
let pendingComeBet = 0;          // Pending Come bet (not yet assigned)
let passLineOdds = 0;            // Odds for the Pass Line bet
let fieldBet = 0;                // One-roll Field bet
let numbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
let point = null;
let mute = false;
let comeBetJustPlaced = false;

// NEW: State stack for undo support.
let stateStack = [];

// -------------------------------
// Updated Odds Payouts for Crapless Craps:
const oddsPayouts = {
  2: 6,
  3: 3,
  4: 2,
  5: 1.5,
  6: 1.2,
  8: 1.2,
  9: 1.5,
  10: 2,   // For a $10 bet, full payout = $10 * 2 = $20
  11: 3,
  12: 6
};

// ===============================
// State Management Functions (for Undo)
// ===============================
function getCurrentState() {
  // Use JSON methods for deep cloning of object states.
  return {
    freeCash: freeCash,
    betAmounts: JSON.parse(JSON.stringify(betAmounts)),
    oddsBets: JSON.parse(JSON.stringify(oddsBets)),
    comeBets: JSON.parse(JSON.stringify(comeBets)),
    comeOddsBets: JSON.parse(JSON.stringify(comeOddsBets)),
    pendingComeBet: pendingComeBet,
    passLineOdds: passLineOdds,
    fieldBet: fieldBet,
    point: point
  };
}

function setState(state) {
  freeCash = state.freeCash;
  betAmounts = state.betAmounts;
  oddsBets = state.oddsBets;
  comeBets = state.comeBets;
  comeOddsBets = state.comeOddsBets;
  pendingComeBet = state.pendingComeBet;
  passLineOdds = state.passLineOdds;
  fieldBet = state.fieldBet;
  point = state.point;
}

// --- Helper to Check Contract Bets in a Given State ---
function isContractActive(state) {
  return ((state.betAmounts["pass"] || 0) > 0 || state.pendingComeBet > 0);
}

// Updated undo: block undo only if a contract bet is active.
function undo() {
  let currentState = getCurrentState();
  if (isContractActive(currentState)) {
    alert("Cannot undo a contract base bet (Pass Line or pending Come bet) until it is resolved.");
    return;
  }
  if (stateStack.length > 0) {
    let lastState = stateStack.pop();
    setState(lastState);
    updateUI();
  } else {
    alert("No actions to undo.");
  }
}

// ===============================
// UI & Utility Functions
// ===============================
function selectChip(amount) {
  betAmount = amount;
  document.querySelectorAll('.chip').forEach(chip => chip.classList.remove('selected'));
  document.querySelectorAll('.chip').forEach(chip => {
    if (chip.innerText === `$${amount}`) chip.classList.add('selected');
  });
}

function playSound(id) {
  if (!mute) {
    const audio = document.getElementById(id);
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  }
}

function toggleMute() {
  mute = !mute;
  alert(mute ? "🔇 Sounds muted" : "🔊 Sounds on");
}

/**
 * Checks if total funds (freeCash + committed bets) are 0 or less.
 */
function checkBankroll() {
  const totalFunds = freeCash + getTotalBets();
  if (totalFunds <= 0) {
    alert("Game Over! Your total funds are depleted.");
    resetGame();
  }
}

// ===============================
// Main Dice Roll and Bet Resolution
// ===============================
function rollDice() {
  const finalDie1 = Math.floor(Math.random() * 6) + 1;
  const finalDie2 = Math.floor(Math.random() * 6) + 1;
  const roll = finalDie1 + finalDie2;

  playSound("diceSound");

  animateDice(finalDie1, finalDie2, function() {
    // These local variables track resolved wins and losses on this roll.
    let rollWins = 0;              // Sum of full payouts from bets that resolve as wins
    let rollLossesDisplay = 0;     // Sum of wager amounts lost for bets that resolve as losses (for display only)
    let resultLog = [];
    let pointEstablishedThisRoll = false;

    // --- Automatic Point Handling (when NO Pass Line bets are on the table) ---
    // This block will clear or set the point only when no Pass Line bet is active.
    if (Object.keys(betAmounts).length === 0) {
      if (point !== null) {
        // If the roll equals either 7 or the existing point, clear it.
        if (roll === 7 || roll === point) {
          resultLog.push("Button is off");
          point = null;
        }
      } else if (point === null && roll !== 7) {
        // If no point exists, and roll is not 7, set the point.
        point = roll;
        resultLog.push(`Button is on ${point}`);
      }
    }

    // --- Pass Line Bet Resolution (One-Roll Bet) ---
    if (betAmounts["pass"]) {
      if (point === null) {
        // Come-out roll
        if (roll === 7) {
          // Win: full payout = wager * 2. (Wager returns plus profit equal to wager.)
          rollWins += betAmounts["pass"] * 2;
          resultLog.push(`Pass Line wins $${betAmounts["pass"] * 2} on come-out roll!`);
        } else {
          point = roll;
          pointEstablishedThisRoll = true;
          resultLog.push(`Point is set to ${point}`);
        }
      } else {
        if (roll === point) {
          // Win on established point: full payout = wager * 2.
          rollWins += betAmounts["pass"] * 2;
          resultLog.push(`Pass Line wins $${betAmounts["pass"] * 2}`);
          if (passLineOdds > 0) {
            const oddsWin = passLineOdds * oddsPayouts[point];
            rollWins += oddsWin;
            resultLog.push(`Pass Line odds pay $${oddsWin.toFixed(2)}`);
            passLineOdds = 0;
          }
          betAmounts["pass"] = 0;
          point = null;
        } else if (roll === 7) {
          // Loss: record loss (for display) but do not subtract it again from freeCash.
          // (Wager already deducted.)
          let lossAmount = betAmounts["pass"] * 2;
          rollLossesDisplay += lossAmount;
          resultLog.push(`Pass Line loses: $${lossAmount}`);
          // And for Pass Line Odds loss, record their wager.
          rollLossesDisplay += passLineOdds;
          resultLog.push(`Pass Line odds lose: $${passLineOdds}`);
          betAmounts["pass"] = 0;
          passLineOdds = 0;
          point = null;
        }
      }
    }

    // --- Field Bet Resolution (One-Roll Bet) ---
    if (fieldBet > 0) {
      if ([3, 4, 9, 10, 11].includes(roll)) {
        // Win: full payout = wager * 2.
        let payout = fieldBet * 2;
        rollWins += payout;
        resultLog.push(`Field bet wins DOUBLE! $${payout}`);
      } else if ([2, 12].includes(roll)) {
        // Win: full payout = wager * 3.
        let payout = fieldBet * 3;
        rollWins += payout;
        resultLog.push(`Field bet wins TRIPLE! $${payout}`);
      } else {
        // Loss: record lost wager.
        rollLossesDisplay += fieldBet;
        resultLog.push(`Field bet loses: $${fieldBet}`);
      }
      fieldBet = 0;
    }

    // --- Place Bet Resolution for Number Bets ---
    if (betAmounts[roll]) {
      // When the roll matches a Place bet, the bet is resolved:
      let payout = betAmounts[roll] * oddsPayouts[roll];
      rollWins += payout;
      resultLog.push(`Place bet on ${roll} pays $${payout.toFixed(2)}`);
      // Also, resolve any odds on that Place bet:
      if (oddsBets[roll]) {
        let oddsPayout = oddsBets[roll] * oddsPayouts[roll];
        rollWins += oddsPayout;
        resultLog.push(`Odds on ${roll} pay $${oddsPayout.toFixed(2)}`);
        delete oddsBets[roll];
      }
    }

    // --- Resolve Already Assigned Come Bets (One-Roll Bets) ---
    Object.entries(comeBets).forEach(([num, amount]) => {
      if (roll === 7) {
        rollLossesDisplay += amount;
        resultLog.push(`Come bet on ${num} loses: $${amount}`);
        if (comeOddsBets[num]) {
          rollLossesDisplay += comeOddsBets[num];
          resultLog.push(`Come odds on ${num} lose: $${comeOddsBets[num]}`);
          delete comeOddsBets[num];
        }
        delete comeBets[num];
      } else if (+num === roll) {
        let payout = amount * 2;
        rollWins += payout;
        resultLog.push(`Come bet on ${num} pays $${payout}`);
        if (comeOddsBets[num]) {
          let oddsPayout = comeOddsBets[num] * oddsPayouts[num];
          rollWins += oddsPayout;
          resultLog.push(`Come odds on ${num} pay $${oddsPayout.toFixed(2)}`);
          delete comeOddsBets[num];
        }
        delete comeBets[num];
      }
    });

    // --- Process Pending Come Bet (One-Roll Bet) ---
    if (pendingComeBet > 0) {
      if (roll === 7) {
        rollLossesDisplay += pendingComeBet;
        resultLog.push(`Pending Come bet loses: $${pendingComeBet}`);
        pendingComeBet = 0;
      } else if (roll === point) {
        resultLog.push(`Come bet pushes on the point (${point}) and remains pending.`);
        // pendingComeBet remains.
      } else {
        comeBets[roll] = (comeBets[roll] || 0) + pendingComeBet;
        resultLog.push(`Pending Come bet moves to ${roll}`);
        pendingComeBet = 0;
      }
    }
    comeBetJustPlaced = false;

    // --- Clear Losing Place Bets if 7 (for Number Bets) ---
    numbers.forEach(num => {
      if (roll === 7 && betAmounts[num]) {
        rollLossesDisplay += betAmounts[num];
        resultLog.push(`Place bet on ${num} loses: $${betAmounts[num]}`);
        delete betAmounts[num];
        if (oddsBets[num]) {
          rollLossesDisplay += oddsBets[num];
          resultLog.push(`Odds on ${num} lose: $${oddsBets[num]}`);
          delete oddsBets[num];
        }
      }
    });

    // --- Update freeCash ---
    // Since wagers were deducted when bets were placed,
    // add back only the wins (the full payouts from winning bets).
    // Unresolved (contract) bets remain deducted in freeCash.
    freeCash += rollWins;

    // For display, calculate net for this roll (wins minus the lost wager amounts)
    let displayNet = rollWins - rollLossesDisplay;

    checkBankroll();
    showFloatingWinnings(displayNet);
    updateRollHistory(roll, displayNet, resultLog, rollWins, rollLossesDisplay);
    updateUI();
  });
} // End of rollDice function


// ===============================
// Animate Dice Function (Unchanged)
// ===============================
function animateDice(finalDie1, finalDie2, callback) {
  let count = 0;
  const intervalDuration = 40;
  const maxCount = 20;
  const interval = setInterval(() => {
    document.getElementById("dice1").innerText = Math.floor(Math.random() * 6) + 1;
    document.getElementById("dice2").innerText = Math.floor(Math.random() * 6) + 1;
    count++;
    if (count >= maxCount) {
      clearInterval(interval);
      document.getElementById("dice1").innerText = finalDie1;
      document.getElementById("dice2").innerText = finalDie2;
      if (callback) callback();
    }
  }, intervalDuration);
}


// ===============================
// Betting Functions (Undo functionality included)
// ===============================
function pushState() {
  stateStack.push(getCurrentState());
}

function getCurrentState() {
  return {
    freeCash: freeCash,
    betAmounts: JSON.parse(JSON.stringify(betAmounts)),
    oddsBets: JSON.parse(JSON.stringify(oddsBets)),
    comeBets: JSON.parse(JSON.stringify(comeBets)),
    comeOddsBets: JSON.parse(JSON.stringify(comeOddsBets)),
    pendingComeBet: pendingComeBet,
    passLineOdds: passLineOdds,
    fieldBet: fieldBet,
    point: point
  };
}

function setState(state) {
  freeCash = state.freeCash;
  betAmounts = state.betAmounts;
  oddsBets = state.oddsBets;
  comeBets = state.comeBets;
  comeOddsBets = state.comeOddsBets;
  pendingComeBet = state.pendingComeBet;
  passLineOdds = state.passLineOdds;
  fieldBet = state.fieldBet;
  point = state.point;
}

// function undo() {
//   if (stateStack.length > 0) {
//     let lastState = stateStack.pop();
//     setState(lastState);
//     updateUI();
//   } else {
//     alert("No actions to undo.");
//   }
// }

function placeBet(key) {
  if (key === "pass" && point !== null)
    return alert("Cannot place a new Pass Line bet once the point is set.");
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  playSound("chipSound");
  betAmounts[key] = (betAmounts[key] || 0) + betAmount;
  updateUI();
}

function placeOddsBet(num) {
  if (!betAmounts[num])
    return alert("You must have a Place bet on this number to add odds.");
  const maxOdds = betAmounts[num] * 3;
  if ((oddsBets[num] || 0) + betAmount > maxOdds) {
    return alert(`Maximum odds for ${num} is $${maxOdds}`);
  }
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  oddsBets[num] = (oddsBets[num] || 0) + betAmount;
  playSound("chipSound");
  updateUI();
}

function placeFieldBet() {
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  playSound("chipSound");
  fieldBet += betAmount;
  updateUI();
}

function placeComeBet() {
  if (point === null)
    return alert("Cannot place a Come bet before the point is set.");
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  playSound("chipSound");
  pendingComeBet += betAmount;
  updateUI();
}

function placeComeOddsBet(num) {
  if (!comeBets[num])
    return alert("You must have a Come bet on this number to add come odds.");
  const maxOdds = comeBets[num] * 3;
  if ((comeOddsBets[num] || 0) + betAmount > maxOdds) {
    return alert(`Maximum come odds for ${num} is $${maxOdds}`);
  }
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  comeOddsBets[num] = (comeOddsBets[num] || 0) + betAmount;
  playSound("chipSound");
  updateUI();
}

function placePassLineOddsBet() {
  if (!point || !betAmounts["pass"])
    return alert("You must have a Pass Line bet and an active point.");
  const maxOdds = betAmounts["pass"] * 3;
  if (passLineOdds + betAmount > maxOdds)
    return alert(`Max pass line odds is $${maxOdds}`);
  if (freeCash < betAmount) return alert("Not enough cash");
  pushState();
  freeCash -= betAmount;
  passLineOdds += betAmount;
  playSound("chipSound");
  updateUI();
}

function placeAcrossBet() {
  const totalCost = numbers.length * betAmount;
  if (freeCash < totalCost) return alert("Not enough cash for Across");
  pushState();
  numbers.forEach(num => {
    betAmounts[num] = (betAmounts[num] || 0) + betAmount;
  });
  freeCash -= totalCost;
  playSound("chipSound");
  updateUI();
}

// --- Updated Clear Bets Function ---
// Updated clearBets: if contract bets are active, only clear non-contract bets.
function clearBets() {
  // Here, contract bets are only the base Pass Line bet and pending Come bet.
  if ((betAmounts["pass"] || 0) > 0 || pendingComeBet > 0) {
    // Contract bets exist – we will leave them intact and clear only non-contract bets.
    // For numeric Place bets and odds bets (both in betAmounts and oddsBets) we clear them:
    numbers.forEach(num => {
      delete betAmounts[num];
      delete oddsBets[num];
    });
    // Also clear field bets:
    fieldBet = 0;
    // And clear come bets (the ones that have already been assigned) and come odds bets:
    comeBets = {};
    comeOddsBets = {};
    updateUI();
    alert("Non-contract bets (e.g. Place and odds bets) have been cleared. Contract bets remain.");
  } else {
    // No contract bets, so clear all bets.
    betAmounts = {};
    oddsBets = {};
    fieldBet = 0;
    pendingComeBet = 0;
    passLineOdds = 0;
    comeBets = {};
    comeOddsBets = {};
    updateUI();
  }
}


function resetGame() {
  pushState();
  initialCash = 500;
  freeCash = initialCash;
  betAmounts = {};
  oddsBets = {};
  comeBets = {};
  comeOddsBets = {};
  fieldBet = 0;
  pendingComeBet = 0;
  passLineOdds = 0;
  point = null;
  document.getElementById("rollHistory").innerHTML = "<h3>Roll History</h3>";
  updateUI();
}

// ===============================
// UI Update Functions
// ===============================
function updateUI() {
  const committed = getTotalBets();
  const totalFunds = freeCash + committed;
  const net = totalFunds - initialCash;
  document.querySelector(".bankroll-display").innerHTML =
    `Bankroll: <span id="bankroll">${freeCash}</span><br>
     Cash: $${freeCash} | Committed: $${committed} | Total: $${totalFunds} | Net: $${net}`;

  const fieldEl = document.getElementById("fieldBetChip");
  if (fieldBet > 0) {
    fieldEl.innerHTML = `<div class="chip-display">$${fieldBet}</div>`;
  } else {
    fieldEl.innerHTML = "";
  }

  const comeEl = document.getElementById("comeBetChip");
  if (pendingComeBet > 0) {
    comeEl.innerHTML = `<div class="chip-display">$${pendingComeBet}</div>`;
  } else {
    comeEl.innerHTML = "";
  }

  const passEl = document.getElementById("passLineChip");
  if (betAmounts["pass"] && betAmounts["pass"] > 0) {
    passEl.innerHTML = `<div class="chip-display">$${betAmounts["pass"]}</div>`;
  } else {
    passEl.innerHTML = "";
  }

  const passOddsEl = document.getElementById("passLineOddsChip");
  if (passLineOdds > 0) {
    passOddsEl.innerHTML = `<div class="chip-display">$${passLineOdds}</div>`;
  } else {
    passOddsEl.innerHTML = "";
  }

  updateNumberBets();
}

function updateNumberBets() {
  const container = document.getElementById("numberBets");
  container.innerHTML = "";
  numbers.forEach(num => {
    const base = betAmounts[num] || 0;
    const come = comeBets[num] || 0;
    const comeOdds = comeOddsBets[num] || 0;
    const baseChip = base > 0
      ? `<div class="chip-display">$${base}</div>`
      : `<span class="empty-label">Place</span>`;
    const comeChip = come > 0
      ? `<div class="chip-display">$${come}</div>`
      : `<span class="empty-label">Come</span>`;
    const comeOddsChip = comeOdds > 0
      ? `<div class="chip-display">$${comeOdds}</div>`
      : `<span class="empty-label">Odds</span>`;
    const box = document.createElement("div");
    box.className = "number-box";
    if (point === num) box.classList.add("point-highlight");
    box.innerHTML = `
      <div class="num-header"><strong>${num}</strong></div>
      <div class="bets-row">
          <div class="bet-zone place-bet" onclick="placeBet(${num})">
            ${baseChip}
          </div>
      </div>
      <div class="bets-row">
          <div class="bet-zone come-bet" onclick="alert('This is a read-only display for Come bets.')">
            ${comeChip}
          </div>
          <div class="bet-zone come-odds-bet" onclick="placeComeOddsBet(${num})">
            ${comeOddsChip}
          </div>
      </div>
    `;
    container.appendChild(box);
  });
}

function getTotalBets() {
  const base = Object.values(betAmounts).reduce((t, val) => t + val, 0);
  const come = Object.values(comeBets).reduce((t, val) => t + val, 0);
  const comeOdds = Object.values(comeOddsBets).reduce((t, val) => t + val, 0);
  return base + fieldBet + pendingComeBet + passLineOdds + come + comeOdds;
}

function showFloatingWinnings(amount) {
  const floatEl = document.getElementById("floatWinnings");
  if (!floatEl) return;
  floatEl.innerText = `${amount >= 0 ? "+" : "-"}$${Math.abs(amount).toFixed(2)}`;
  floatEl.style.color = amount >= 0 ? "green" : "salmon";
  floatEl.style.display = "block";
  floatEl.style.animation = "floatUp 1s ease-out";
  playSound(amount >= 0 ? "winSound" : "loseSound");
  setTimeout(() => {
    floatEl.style.display = "none";
    floatEl.style.animation = "";
  }, 1000);
}

function updateRollHistory(roll, netDisplayed, resultLog, rollWins, rollLosses) {
  const history = document.getElementById("rollHistory");
  const entry = document.createElement("div");
  entry.style.marginBottom = "10px";
  entry.innerHTML = `
    <strong>Roll: ${roll}</strong> |
    <span style="color:${netDisplayed >= 0 ? 'green' : 'red'};">
      ${netDisplayed >= 0 ? "+" : "-"}$${Math.abs(netDisplayed).toFixed(2)}
    </span>
    <br>Wins: $${rollWins} | Losses: $${rollLosses}
    <br>${resultLog.join('<br>')}
  `;
  history.prepend(entry);
}

// Initialize UI on page load
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
});
