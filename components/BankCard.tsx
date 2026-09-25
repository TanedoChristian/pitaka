import { accountLabel, bankLabel, getBank } from "@/lib/banks";
import { formatPeso } from "@/lib/format";

export type CardFace = {
  bank: string;
  card_type: string;
  nickname?: string | null;
  last4?: string | null;
  keyword?: string | null;
};

function Chip() {
  return (
    <span className="pay-chip" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function Contactless() {
  return (
    <svg className="pay-wave" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M8 8c2.2 2.2 2.2 5.8 0 8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.2 5.6c3.6 3.6 3.6 9.2 0 12.8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.4 3.2c5 5 5 12.6 0 17.6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function BankCard({
  account,
  spent,
  count,
}: {
  account: CardFace;
  spent?: number;
  count?: number;
}) {
  const bank = getBank(account.bank);
  const last4 = account.last4 || "••••";
  const title = account.nickname?.trim() || bankLabel(account.bank);
  const kind = account.card_type === "cash" ? "Wallet" : account.card_type;

  return (
    <article className={`pay-card bank-${account.bank}`}>
      <div className="pay-face">
        <div className="pay-top">
          <span className="pay-wordmark">{bank?.wordmark ?? title}</span>
          <span className="pay-kind">{kind}</span>
        </div>
        <div className="pay-mid">
          <Chip />
          <Contactless />
        </div>
        <p className="pay-pan">
          <span>••••</span>
          <span>••••</span>
          <span>••••</span>
          <span>{last4}</span>
        </p>
        <div className="pay-bottom">
          <span className="pay-name">{title}</span>
          <span className="pay-net">{account.bank === "cash" ? "PHP" : "PH"}</span>
        </div>
      </div>
      {(spent != null || account.keyword) && (
        <div className="pay-meta">
          {spent != null && (
            <div>
              <p className="stat-label">{count ? `${count} this month` : "This month"}</p>
              <p className="pay-spent">{formatPeso(spent)}</p>
            </div>
          )}
          {account.keyword && (
            <p className="pay-keyword">
              <span className="chip">keyword</span> {account.keyword}
            </p>
          )}
        </div>
      )}
      <span className="vh">{accountLabel(account)}</span>
    </article>
  );
}
