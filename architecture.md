# Virtual Sports Platform — Complete System Architecture & Functionality Guide

0Balance  
Register

Balance  
The platform follows a 3-tier hierarchy:

OPERATOR (Top-level admin)  
         ↕  Credits \+ Commission Configuration  
AGENT (Middle layer — human payment processor)  
         ↕  Credits \+ P2P Cash Transactions (Mobile Banking)  
PLAYER (End user — bets on virtual sports)

1TIER 1 — PLAYER PLATFORM (Frontend)  
This is the main website where players register, log in, browse virtual sports games, place bets, and manage their wallet. It is the public-facing platform.

2A. Authentication  
0Register with phone number (phone \= account identifier)  
Login with phone and password  
Password reset via SMS/OTP  
Session management with auto-logout

2B. Wallet & Balance  
0Balance display widget with show/hide (eye) toggle  
Balance breakdown: Total Balance / Withdrawable / Used / Unused / Bonus  
Real-time balance update after each bet settlement or transaction  
Currency: ETB (Ethiopian Birr)

2C. Deposit Request Flow (3-Step Wizard)  
The deposit process uses a 3-step wizard called “Betconnect”:

3Step 1 — Choose Transaction Type  
0Player selects either Deposit (Add funds to account) or Withdrawal (Withdraw funds from account).  
Deposit tags: Secure, Instant, Mobile Pay  
Withdrawal tags: Protected, Fast Payout

3Step 2 — Fill Transaction Details  
0Amount field (Min: 100 ETB, Max: 100,000 ETB)  
Phone Number (user’s registered mobile number)  
Zplay Phone Number (account identifier on the platform)  
Payment Method selection (grid of 4 options):

- CBE Birr (Commercial Bank of Ethiopia mobile banking)  
-    \- Telebirr (Ethio Telecom mobile wallet)  
-    \- eBirr (Digital wallet)  
-    \- Bank Transfer (Direct bank transfer)

3Step 3 — Confirmation  
0Transaction is submitted with status \= PENDING  
Player waits for an agent to claim and process the request  
Player receives a notification when agent claims  
Player receives confirmation when balance is credited

2D. Virtual Sports Lobby  
0Hero banner with animated slideshow promoting game categories  
Most Liked / Most Popular / Trending Games horizontal carousels  
Category filter tabs: All, Favourites, Most Popular, Most Liked, Last Played Games, Trending Games, Football  
Text search bar for games  
Provider filter sidebar with checkboxes (ALL 44 games, DIGITAIN 16, LEAP 17, PRAGMATIC 6, etc.)  
Game cards: thumbnail, name, provider badge, HOT/TOP/NEW badge overlay, min-max bet range  
Game categories: Keno, Football Cup, World Cup, Horse Racing, Greyhound Racing, Steeplechase, Lucky Six, Penalty Shootout, Force 1 Racing, Virtual Races, and more

2E. In-Game Interface  
The platform wraps all games in a universal shell with the following features:

Layout Controls (top bar):

- 1-game layout (single view)  
-    \- 2-game layout (split view with \+Add Game panel)  
-    \- 4-game layout (quad view, watch 4 games simultaneously)

Right Sidebar Icons (per game):

- Close (X) — remove game from view  
-    \- Open in New Tab — with warning dialog  
-    \- Fullscreen — expands game to full window  
-    \- Refresh — reload the game  
-    \- Like (thumbs up) — rate the game  
-    \- Favourite (star) — save to favourites

Game Tab Bar:

- Horizontal scrollable tabs showing multiple open games  
-    \- Each tab shows: game icon, name, live countdown timer  
-    \- Coloured dot indicator (green \= active/open)  
-    \- “...” overflow for more games

2F. Betting System  
0Betslip features:

- Selection display: match name, market, selection and odds  
-    \- Stake input field per selection  
-    \- Singles counter (number of bets)  
-    \- Total Bet and Estimated Return shown at bottom  
-    \- “Accept better Odds” toggle (auto-accepts improved odds)  
-    \- SUBMIT BET button (enabled only when stake entered)  
-    \- Remove individual selections (X per line)  
-    \- Quick Bet toggle (fast placement)

Bet types supported:

- Single bets (one outcome)  
-    \- Multi/Accumulator bets (multiple selections)  
-    \- Combo/Exacta bets (Horse Racing: pick 1st and 2nd finisher in order)  
-    \- Win / Place / Show bets (Horse Racing)

Markets available by game type:

- 1X2 Fulltime Result (Football)  
-    \- Under/Over Total Goals 2.5 and 3.5 (Football)  
-    \- Match Total Goals exact: 0, 1, 2, 3, 4, 5+ (Football)  
-    \- Win / Place / Show odds (Racing)  
-    \- Exacta combination bet (Racing)  
-    \- Number selection bets (Keno, Lucky 6\)

Bet locking rules:

- Bets are open before and during halftime  
-    \- Bets lock (BET CLOSED) when match second half starts  
-    \- Racing bets lock when race starts

2G. Bonuses & Promotions  
05% Daily Cashback — up to 10,000 ETB back every day  
500% Sport Accumulator Bonus — for multi-bets  
Ultra Cash Back — higher cashback tier  
Sport Single Boost — boosted odds on selected matches  
Auto Cash Out — automated settlement before event ends  
CombiBoost — multi-bet booster: \+10% to \+40% extra winnings based on number of selections (minimum odds 1.3)  
Daily Tournament — prize pool up to 3,495,000 ETB  
Promocode system — enter codes for bonus credits  
Bonus wallet is separate from real money wallet

1TIER 2 — AGENT PORTAL (Middle Layer)  
Agents are human middlemen who handle real cash transactions between players and the platform. They use a separate web portal to process deposit and withdrawal requests via mobile banking (CBE Birr, Telebirr, eBirr, Bank Transfer). Agents are created and managed by the Operator.

2A. Agent Authentication  
Separate login portal (different URL from player platform)  
Agent account created and managed by the Operator  
Role-based access: agents only see their own assigned transactions  
Secure session management

2B. Transaction Queue (Main Screen)  
This is the core screen of the Agent Portal. It shows a live list of incoming transaction requests from players.

Each transaction item in the queue displays:

- Player phone number / ID (partially masked for privacy, e.g. 7\*\*\*2)  
-    \- Transaction type: Deposit or Withdrawal  
-    \- Amount in ETB  
-    \- Payment method selected by the player (CBE Birr, Telebirr, etc.)  
-    \- Timestamp of request creation  
-    \- Current status: New / Claimed / Completed / Failed

Filter tabs on the queue:

- New — unclaimed requests waiting for an agent  
-    \- In Progress — claimed and being processed  
-    \- Completed — successfully finished  
-    \- All — full history

2C. Claim & Chat Flow  
This is the step-by-step process when an agent handles a deposit request:

1. Agent sees new transaction in queue → clicks CLAIM button  
2. 2\. Transaction status changes to CLAIMED and is locked to that agent (prevents double-claiming)  
3. 3\. A real-time chat window opens between the agent and the player  
4. 4\. Agent sends their personal mobile banking number/account to the player via chat  
5. 5\. Player sends the money from their bank app (Telebirr/CBE Birr) to the agent  
6. 6\. Agent receives the cash payment and confirms receipt  
7. 7\. Agent clicks “Confirm & Credit Player” button  
8. 8\. System automatically: deducts from agent credit balance and adds to player balance  
9. 9\. Commission is automatically calculated and added to agent earnings  
10. 10\. Transaction status changes to COMPLETED  
11. 11\. Player receives in-app notification of updated balance

For Withdrawal requests:

1. Agent claims the withdrawal request  
2. 2\. Chat opens — agent confirms player’s mobile banking details  
3. 3\. Agent sends money from their personal bank to the player  
4. 4\. Player confirms receipt via chat  
5. 5\. System deducts amount from player balance  
6. 6\. Agent’s credit float is reimbursed by the system  
7. 7\. Transaction marked COMPLETED

2D. Agent Wallet & Credit Balance  
Each agent has a credit balance used to fund player deposits  
When agent deposits to a player: credit is deducted from agent balance, added to player balance  
When agent processes a withdrawal: system deducts from player and reimburses agent  
Agent must request a credit top-up from the Operator when balance is low  
Agent top-up request follows the same P2P flow: agent pays Operator via mobile banking → Operator credits agent balance

2E. Agent Dashboard  
0Total transactions processed today / this week / this month  
Total deposits and withdrawals volume  
Commission earned today / this week / this month  
Current credit balance available  
List of registered players under this agent  
Transaction history with search and filter

1TIER 3 — OPERATOR PORTAL (Back-Office Admin)  
The Operator is the top-level administrator of the entire platform. They manage all agents, configure commission rules, control credit flows between agents, manage players, configure games, and oversee all financial operations.

2A. Agent Management  
0Create new agents (set name, phone, initial credit, commission rates)  
View all agents: ID, name, phone, current balance, status (active/suspended)  
Suspend or delete agents  
Assign agents to regions or pools  
View each agent’s list of registered players  
View agent performance metrics: volume, commissions paid, active players

2B. Commission Engine (Key Feature)  
The Operator configures commission rules per agent or globally. All commissions are calculated automatically by the system.

Commission Types:

1. Claim Commission %  
2.    \- Agent earns a percentage on every transaction they process  
3.    \- Example: agent processes 1,000 ETB deposit → earns 2% \= 20 ETB

2\. Deposit Commission %

- Percentage of the deposited amount credited to the agent as commission

3\. Withdrawal Commission %

- Fee percentage taken on withdrawal transactions  
4. Player Loss Bonus %  
5.    \- When a player registered under an agent loses a bet, the agent earns a percentage of that loss  
6.    \- Example: Player loses 500 ETB → Agent gets 5% \= 25 ETB bonus  
7.    \- This incentivizes agents to recruit and retain active players

Configuration per agent:

- Set minimum odds requirement for commission eligibility  
-    \- Set maximum commission cap per day/week  
-    \- Enable or disable specific commission types per agent

2C. Credit Distribution to Agents  
Agent submits a credit top-up request from the Agent Portal  
Operator Portal shows the agent request in a queue (same P2P model as player→agent)  
Operator claims the request and shares their payment details  
Agent sends money to Operator via mobile banking  
Operator confirms receipt → credits the agent’s balance  
All credit movements are logged with full audit trail

2D. Player Management  
0View all players: ID, phone, balance, registration date, referring agent  
Manually adjust player balance (admin override with reason log)  
View full bet history per player  
Block or unblock players  
View player lifetime value (LTV)  
Search and filter players by agent, status, balance range, date joined

2E. Financial Reports & Analytics  
0Total deposits and withdrawals by period (daily/weekly/monthly)  
Agent performance report: volume, commissions paid, number of transactions  
Platform revenue from house edge on game results  
Player lifetime value (LTV) and activity reports  
Full transaction audit log: every credit movement with timestamp, user, and amount  
Commission statements per agent (downloadable)  
Pending vs. completed transaction ratios  
Top players and top agents by volume

2F. Game & Promotion Configuration  
0Enable or disable game providers on the platform  
Set minimum and maximum bet limits per game  
Configure bet ranges shown in the lobby  
Create, edit, and deactivate promotions (cashback, accumulator bonus, etc.)  
Manage CombiBoost tiers and percentages  
Manage promo codes (generate, assign, expire)  
Configure Daily Tournament prize pools and schedules  
Set bonus wagering requirements

1Complete Transaction Flows  
2Flow 1: Player Deposits Credit

1.  Player opens Deposit form and enters: amount, phone number, Zplay phone, payment method  
2. 2\.  Transaction record created in database with status \= PENDING  
3. 3\.  Agent Portal displays the new request in the transaction queue  
4. 4\.  Agent clicks CLAIM → transaction status changes to CLAIMED (locked to this agent)  
5. 5\.  Real-time chat window opens between agent and player  
6. 6\.  Agent sends their mobile banking number to the player via chat  
7. 7\.  Player sends money via Telebirr / CBE Birr / eBirr to the agent  
8. 8\.  Agent confirms receipt of payment in chat  
9. 9\.  Agent clicks “Confirm & Credit Player”  
10. 10\. System deducts amount from agent credit balance  
11. 11\. System adds amount to player balance  
12. 12\. Commission automatically calculated and added to agent earnings  
13. 13\. Transaction status changes to COMPLETED  
14. 14\. Player receives push notification with updated balance

2Flow 2: Player Withdraws Credit

1.  Player opens Withdrawal form and enters: amount, phone number, payment method  
2. 2\.  System checks player has sufficient withdrawable balance  
3. 3\.  Transaction created with status \= PENDING  
4. 4\.  Agent sees request in queue and clicks CLAIM  
5. 5\.  Chat opens between agent and player  
6. 6\.  Agent confirms player’s mobile banking number via chat  
7. 7\.  Agent sends the money from their bank to the player’s mobile banking account  
8. 8\.  Player confirms receipt in chat  
9. 9\.  Agent clicks “Confirm Withdrawal Completed”  
10. 10\. System deducts amount from player balance  
11. 11\. Agent’s credit float is reimbursed by the system  
12. 12\. Transaction marked COMPLETED

2Flow 3: Agent Requests Credit Top-Up from Operator

1.  Agent’s credit balance is running low  
2. 2\.  Agent submits a credit top-up request in the Agent Portal (amount \+ payment method)  
3. 3\.  Operator Portal displays the request in the agent credit queue  
4. 4\.  Operator claims the request  
5. 5\.  Operator shares their payment details with the agent  
6. 6\.  Agent sends money to Operator via mobile banking  
7. 7\.  Operator confirms receipt and clicks “Credit Agent Balance”  
8. 8\.  Agent’s credit balance is updated  
9. 9\.  Agent can now process more player deposits

2Flow 4: Player Loss → Agent Commission Bonus

1.  Player (linked to Agent X) places a bet and loses  
2. 2\.  Game result is settled by the system  
3. 3\.  Loss amount is recorded against the player’s account  
4. 4\.  System calculates: loss\_amount × agent\_loss\_bonus\_%  
5. 5\.  Bonus is automatically credited to Agent X’s commission balance  
6. 6\.  Operator can view all commission payouts in the financial report  
7. 7\.  Agent sees earned bonus in their dashboard

1Core Data Models  
2Player  
0id, phone, password\_hash, balance, bonus\_balance, withdrawable\_balance, agent\_id (referring agent), status (active/blocked), created\_at, last\_login

2Agent  
0id, phone, name, password\_hash, credit\_balance, commission\_rate (%), loss\_bonus\_rate (%), deposit\_commission\_rate (%), operator\_id, status (active/suspended), created\_at, total\_volume, total\_commission\_earned

2Transaction  
0id, type (deposit/withdrawal), player\_id, agent\_id, amount, payment\_method, status (pending/claimed/completed/failed), chat\_thread\_id, created\_at, claimed\_at, completed\_at

2Chat Message  
0id, transaction\_id, sender\_type (agent/player), sender\_id, message\_text, timestamp, read\_at

2Commission Log  
0id, agent\_id, player\_id, transaction\_id, commission\_type (claim/player\_loss/deposit/withdrawal), amount, rate\_applied, created\_at

2Agent Credit Request  
0id, agent\_id, operator\_id, amount, payment\_method, status (pending/claimed/completed), created\_at, approved\_at

1Real-Time & Technical Requirements  
The following real-time features are required to make the system work properly:

WebSocket / Real-time Push (required for):

- Live transaction queue updates in the Agent Portal (new requests appear instantly)  
-    \- Agent-Player chat messages (instant delivery, no page refresh)  
-    \- Balance updates pushed to player after transaction completes  
-    \- Live game countdowns and round timers on the player platform  
-    \- Live bet result notifications

Claim Locking (concurrency protection):

- Database-level optimistic lock or transaction lock on claim action  
-    \- Prevents two agents from claiming the same transaction simultaneously  
-    \- If two agents click claim at the same time, only one succeeds — the other sees an error

Security:

- All three portals (Player, Agent, Operator) use separate authentication systems  
-    \- JWT or session tokens per role  
-    \- All API endpoints role-restricted  
-    \- Sensitive fields (phone numbers) masked in logs and UI  
-    \- All credit movements have an immutable audit log

Portal Summary  
The system consists of three separate web applications sharing one backend and one database:

PLAYER APP  
Users: Players / bettors  
Key Screens: Game Lobby, Virtual Sport Games, Deposit/Withdraw Wizard, Balance Wallet, Bet Slip, Bet History, Promotions, Statistics

AGENT PORTAL  
Users: Agents (human payment processors)  
Key Screens: Transaction Queue, Claim & Chat Window, Agent Wallet, Commission Dashboard, Player List, Credit Top-Up Request

OPERATOR PORTAL  
Users: Platform administrators  
Key Screens: Agent Management, Credit Request Queue, Commission Configuration, Financial Reports, Player Management, Game Configuration, Promotion Management, Audit Logs

# Key Notes for Development

The payment model is P2P (peer-to-peer) cash brokerage: no direct bank integration is needed. Real money flows between people via mobile banking apps; the platform only manages internal credit balances.

The referral link between player and agent is established at registration. When a player registers, they are linked to the agent who brought them in. All future commissions from that player flow to that agent.

The Operator sets all the rules. Agents have no ability to change their own commission rates. Players have no visibility into the agent/operator layer.

All three portals should work on mobile browsers as well as desktop, since agents and players will often use mobile phones.