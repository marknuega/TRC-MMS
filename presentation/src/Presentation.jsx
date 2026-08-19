/*
 * Software Developed by Muhammad Amir MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Certified Electronics and Electrical Technician
 * Electrical License CLN-NQ-***6092 · Electronics License CLN-COC-***204
 */

import { useEffect, useState } from "react";
import { BrandMark } from "./brand";
import { Credit } from "./copyright";

const slides = [
  {
    id: "overview",
    kicker: "TRC-MMS / OPERATIONS BRIEF",
    title: "Maintenance, compressed into one message.",
    intro:
      "TRC-MMS turns a short WhatsApp field entry into a controlled maintenance record, inventory action, transmittal, and audit trail.",
  },
  {
    id: "protocol",
    kicker: "01 / FIELD PROTOCOL",
    title: "Two messages. One verified operation.",
    intro:
      "The field team sends the work payload first, then proves the agency context before anything is committed.",
  },
  {
    id: "parser",
    kicker: "02 / SYNTAX ENGINE",
    title: "Every character has a job.",
    intro:
      "The parser reads the operational string by position, while the audited 13-series taxonomy keeps device identities unique and collision-free.",
  },
  {
    id: "outputs",
    kicker: "03 / AUTOMATION",
    title: "One code sequence. Four deliverables.",
    intro:
      "A verified entry fans out into the records teams need to operate, reconcile, and learn from the work.",
  },
  {
    id: "governance",
    kicker: "04 / CONTROL PLANE",
    title: "Visibility follows responsibility.",
    intro:
      "Agency, region, branch, and role boundaries are carried through every transaction so operational speed never outruns accountability.",
  },
];

const variantRows = [
  ["43", "Sidegrip", "43A", "Original"],
  ["43", "Sidegrip", "43B", "Replacement"],
  ["99", "Charger", "99A", "ACP-12 / TH1N"],
  ["99", "Charger", "99B", "818 / STP9000"],
  ["99", "Charger", "99C", "DEY / STP9000"],
];

const modelRows = [
  ["13H", "Airbus TH1N", "H"],
  ["13R", "Airbus THR9 / THR9i", "R"],
  ["13M", "Airbus TMR880i", "M"],
  ["13S", "Hytera MT680", "S"],
  ["13E", "Hytera PT580H / PT680H", "E"],
  ["13N", "Hytera PT590", "N"],
  ["13B", "Sepura SRG3900 Bike", "B"],
  ["13C", "Sepura SRG3900 Carkit", "C"],
  ["13D", "Sepura SRG3900 Desktop", "D"],
  ["13T", "Sepura STP9000", "T"],
];

function SlideNumber({ current }) {
  return (
    <span className="deck-slide-number">
      0{current + 1} <i>/</i> 05
    </span>
  );
}

function OverviewSlide() {
  return (
    <div className="deck-overview">
      <div className="deck-overview-copy">
        <div className="deck-brandline">
          <BrandMark className="deck-mark" />
          <span>TRC Maintenance Management System</span>
        </div>
        <p className="deck-big-number">01</p>
        <div className="deck-rule" />
        <div className="deck-overview-bottom">
          <div>
            <span className="deck-label">FIELD-FIRST</span>
            <strong>WhatsApp-native reporting</strong>
          </div>
          <div>
            <span className="deck-label">ONE-TOUCH</span>
            <strong>Multi-report automation</strong>
          </div>
          <div>
            <span className="deck-label">CONTROLLED</span>
            <strong>Regional data isolation</strong>
          </div>
          <div className="deck-live-cta">
            <span className="deck-label">LIVE APPLICATION</span>
            <a
              href="https://trc-mms.up.railway.app/"
              target="_blank"
              rel="noreferrer"
            >
              Open TRC-MMS <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      <div className="deck-architecture">
        <div className="deck-architecture-title">
          From field signal
          <br />
          to operational truth
        </div>
        <div className="deck-signal">H99ACT 2222 3333 1</div>
        <div className="deck-arrow">↓</div>
        <div className="deck-node-row">
          <span>PARSE</span>
          <span>VERIFY</span>
          <span>DELIVER</span>
        </div>
        <div className="deck-node-grid">
          <div>
            Device
            <br />
            <b>TH1N</b>
          </div>
          <div>
            Agency
            <br />
            <b>PSD</b>
          </div>
          <div>
            Records
            <br />
            <b>04</b>
          </div>
        </div>
        <div className="deck-model-note">
          <b>13-series model taxonomy</b>
          <br />
          Unique database identity. Compact field token remains{" "}
          <strong>H</strong>.
          <small>Lowercase normalizes; legacy numeric codes reject.</small>
        </div>
      </div>
    </div>
  );
}

function ProtocolSlide() {
  return (
    <div className="deck-protocol">
      <div className="deck-step step-one">
        <span className="deck-step-index">01</span>
        <div>
          <span className="deck-label">MESSAGE 1 / PAYLOAD</span>
          <h3>Operational syntax</h3>
          <p>
            Encodes device, component variant, action, quantity, company,
            Tel+ISSI, and technician ID.
          </p>
          <code>H99ACT 2222 3333 1</code>
        </div>
      </div>
      <div className="deck-connector">
        <span>handoff</span>
      </div>
      <div className="deck-step step-two">
        <span className="deck-step-index">02</span>
        <div>
          <span className="deck-label">MESSAGE 2 / AUTHORIZATION</span>
          <h3>Agency verification</h3>
          <p>
            Locks the agency partition, validates the session, and triggers
            batch compilation.
          </p>
          <code>PSD</code>
        </div>
      </div>
      <div className="deck-protocol-footer">
        <span>Accepted agency keys</span>
        <b>PSD</b>
        <b>CD</b>
        <b>MOI</b>
        <em>then execute</em>
      </div>
    </div>
  );
}

function ParserSlide() {
  return (
    <div className="deck-parser">
      <div className="deck-code-panel">
        <span className="deck-label">LIVE TOKEN MAP</span>
        <div className="deck-code">
          <b>H</b>
          <b className="gold">99</b>
          <b className="coral">A</b>
          <b className="mint">C</b>
          <span>T</span>
          <i> 2222 3333 </i>
          <span>1</span>
        </div>
        <div className="deck-code-caption">
          <span>device</span>
          <span>base part</span>
          <span>variant</span>
          <span>action</span>
          <span>company</span>
          <span>Tel+ISSI</span>
          <span>tech</span>
        </div>
        <div className="deck-agency-chip">
          + <b>PSD</b> agency lock
        </div>
      </div>
      <div className="deck-token-list">
        <div>
          <b>H</b>
          <span>Airbus TH1N handheld radio</span>
        </div>
        <div>
          <b className="gold">99A</b>
          <span>
            Charger Variant A <small>ACP-12 / TH1N</small>
          </span>
        </div>
        <div>
          <b className="mint">C</b>
          <span>
            Changed / replaced <small>Quantity defaults to 1</small>
          </span>
        </div>
        <div>
          <b>T</b>
          <span>
            Modern Technology <small>Company entity: T</small>
          </span>
        </div>
        <div>
          <b className="coral">2222 3333</b>
          <span>
            Tel+ISSI <small>Masked secure references: ***2222 / ***3333</small>
          </span>
        </div>
        <div>
          <b className="mint">1</b>
          <span>
            Technician ID <small>Assigned technician: 1</small>
          </span>
        </div>
        <div>
          <b className="gold">PSD</b>
          <span>
            Agency <small>Verification key and partition lock</small>
          </span>
        </div>
        <div className="deck-taxonomy-list">
          <span className="deck-label">AUDITED MODEL LOOKUP</span>
          {modelRows.map(([code, model, token]) => (
            <div key={code}>
              <b>{code}</b>
              <span>
                {model}
                <small>field token: {token}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="deck-variant-table">
        <div className="deck-table-head">
          <span>BASE</span>
          <span>DESCRIPTION</span>
          <span>ACTIVE VARIANT</span>
          <span>REMARK</span>
        </div>
        {variantRows.map((row) => (
          <div className="deck-table-row" key={`${row[2]}`}>
            <span>{row[0]}</span>
            <span>{row[1]}</span>
            <span className="gold">{row[2]}</span>
            <span>{row[3]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputsSlide() {
  const outputs = [
    ["01", "Daily PDF field log", "Work performed, variants, timestamps"],
    ["02", "Inventory deduction", "Regional hub stock, updated instantly"],
    ["03", "Transmittal slips", "Serials, ISSIs, handover receipts"],
    ["04", "Spare parts ledger", "Consumption, PCB returns, RTO history"],
  ];
  return (
    <div className="deck-output-grid">
      {outputs.map(([num, title, copy]) => (
        <div className="deck-output" key={num}>
          <span>{num}</span>
          <div className="deck-output-icon">
            {num === "01" ? "▤" : num === "02" ? "▦" : num === "03" ? "⇄" : "◫"}
          </div>
          <h3>{title}</h3>
          <p>{copy}</p>
          <div className="deck-output-line" />
        </div>
      ))}
    </div>
  );
}

function GovernanceSlide() {
  return (
    <div className="deck-governance">
      <div className="deck-governance-graphic">
        <div className="deck-ring ring-outer">
          <span>REGION</span>
        </div>
        <div className="deck-ring ring-mid">
          <span>BRANCH</span>
        </div>
        <div className="deck-ring ring-inner">
          <span>AGENCY</span>
          <strong>PSD</strong>
        </div>
        <div className="deck-center">
          AUDIT
          <br />
          <b>READY</b>
        </div>
      </div>
      <div className="deck-governance-list">
        <div>
          <b>01</b>
          <h3>Agency partitioning</h3>
          <p>PSD, CD, and MOI records stay segregated by verification key.</p>
        </div>
        <div>
          <b>02</b>
          <h3>Regional oversight</h3>
          <p>
            Field teams see their branch; managers see their assigned operating
            zone.
          </p>
        </div>
        <div>
          <b>03</b>
          <h3>Audit trail integrity</h3>
          <p>
            Technician, masked Tel+ISSI, timestamp, and authorization are
            retained.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Presentation() {
  const [current, setCurrent] = useState(0);
  const slide = slides[current];
  const move = (delta) =>
    setCurrent((value) =>
      Math.min(slides.length - 1, Math.max(0, value + delta)),
    );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        setCurrent(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setCurrent(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section
      className={`deck deck-${slide.id}`}
      aria-label="TRC-MMS presentation"
    >
      <div className="deck-topbar">
        <span className="deck-kicker">{slide.kicker}</span>
        <SlideNumber current={current} />
      </div>
      <div className="deck-heading">
        <h1>{slide.title}</h1>
        <p>{slide.intro}</p>
      </div>
      <div className="deck-content">
        {current === 0 && <OverviewSlide />}
        {current === 1 && <ProtocolSlide />}
        {current === 2 && <ParserSlide />}
        {current === 3 && <OutputsSlide />}
        {current === 4 && <GovernanceSlide />}
      </div>
      <div className="deck-controls">
        <div className="deck-progress">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === current ? "active" : ""}
              onClick={() => setCurrent(index)}
              aria-label={`Go to slide ${index + 1}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <div className="deck-arrows">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={current === 0}
            aria-label="Previous slide"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={current === slides.length - 1}
            aria-label="Next slide"
          >
            →
          </button>
        </div>
      </div>
      <Credit />
    </section>
  );
}
