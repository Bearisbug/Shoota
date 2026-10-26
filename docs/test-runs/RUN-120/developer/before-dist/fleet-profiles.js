/* Official fleet snapshots and type references. Counts marked types are game design. */
(function(root){
const D=root.AIR_DATA||(typeof require!=='undefined'?require('./data.js'):null);
D.fleetProfiles={
  "SQ": {
    "mix": [
      {
        "id": "A350-900",
        "count": 65
      },
      {
        "id": "787-10",
        "count": 28
      },
      {
        "id": "777-300ER",
        "count": 22
      },
      {
        "id": "A380-800",
        "count": 12
      },
      {
        "id": "737-8",
        "count": 23
      }
    ],
    "source": "https://www.singaporeair.com/en_UK/sg/about-us/information-for-investors/financial-results-and-briefings/Business-Update-for-Q1-FY2627/",
    "asOf": "2026-06-30",
    "basis": "snapshot",
    "note": "宽体为主，保留区域航线的 737-8；A350 数量包含 ULR，不重复计数。不含酷航及货机。",
    "growth": [
      "A350-900",
      "787-10",
      "737-8"
    ],
    "scope": "客运机队"
  },
  "TR": {
    "mix": [
      {
        "id": "787-8",
        "count": 13
      },
      {
        "id": "787-9",
        "count": 11
      },
      {
        "id": "A320-200",
        "count": 6
      },
      {
        "id": "A320neo",
        "count": 12
      },
      {
        "id": "A321neo",
        "count": 12
      },
      {
        "id": "E190-E2",
        "count": 9
      }
    ],
    "source": "https://www.singaporeair.com/en_UK/sg/about-us/information-for-investors/financial-results-and-briefings/Business-Update-for-Q1-FY2627/",
    "asOf": "2026-06-30",
    "basis": "snapshot",
    "note": "酷航独立列示；远程宽体、区域窄体与 E190-E2 共同运营。",
    "growth": [
      "A321neo",
      "E190-E2",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "EK": {
    "mix": [
      {
        "id": "A380-800",
        "count": 116
      },
      {
        "id": "777-300ER",
        "count": 119
      },
      {
        "id": "777-200LR",
        "count": 10
      },
      {
        "id": "A350-900",
        "count": 13
      }
    ],
    "source": "https://www.emirates.com/media-centre/emirates-orders-8-additional-airbus-a350-900-aircraft-worth-us-34-billion-at-dubai-airshow-2025/",
    "asOf": "2025-11-19",
    "basis": "snapshot",
    "note": "全宽体客运机队；A380 与 777 为主力，A350 补充中远程。不含 SkyCargo 的 11 架货机和未交付订单。",
    "growth": [
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "BR": {
    "mix": [
      {
        "id": "777-300ER",
        "count": 32
      },
      {
        "id": "787-9",
        "count": 9
      },
      {
        "id": "787-10",
        "count": 13
      },
      {
        "id": "A330-300",
        "count": 9
      },
      {
        "id": "A321-200",
        "count": 17
      }
    ],
    "source": "https://www.evaair.com/en-au/about-eva-air/about-us/market-and-sales-overview/eva-air-fleet/",
    "asOf": "2026-09-01",
    "basis": "snapshot",
    "note": "不含 9 架 777F；尚未交付的 A350-1000 与 A321neo 不算在役。",
    "growth": [
      "787-9",
      "787-10"
    ],
    "scope": "客运机队"
  },
  "FR": {
    "mix": [
      {
        "id": "Boeing 737-800",
        "count": 411
      },
      {
        "id": "Boeing 737-8200",
        "count": 210
      },
      {
        "id": "A320-200",
        "count": 26
      }
    ],
    "source": "https://corporate.ryanair.com/about-us/our-fleet/",
    "asOf": "2026-09-02",
    "basis": "snapshot",
    "note": "737 为绝对主力；按官方集团口径保留旗下 26 架 A320。MAX 10 订单不算在役。",
    "growth": [
      "Boeing 737-8200"
    ],
    "scope": "瑞安集团客运机队（含旗下 A320）"
  },
  "9C": {
    "mix": [
      {
        "id": "Airbus A320 系列（含 A321neo）",
        "count": 140
      }
    ],
    "source": "https://www.ch.com/Static/AboutUs",
    "asOf": "2026-08",
    "basis": "snapshot",
    "note": "单一 A320 家族；官方总量未逐型号拆分，因此不伪造各子型号数量。",
    "growth": [
      "Airbus A320 系列（含 A321neo）"
    ],
    "scope": "客运机队"
  },
  "HO": {
    "mix": [
      {
        "id": "Airbus A320 系列（含 A321）",
        "count": 95
      },
      {
        "id": "787-9",
        "count": 10
      }
    ],
    "source": "https://www.juneyaoair.com/about/company-profile",
    "asOf": "2026-10-24 页面核查",
    "basis": "snapshot",
    "note": "A320 家族执飞国内区域航线，787-9 承担远程；不含九元航空。",
    "growth": [
      "Airbus A320 系列（含 A321）",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "CX": {
    "mix": [
      {
        "id": "Airbus A320/A321neo",
        "count": 16
      },
      {
        "id": "A330-300",
        "count": 43
      },
      {
        "id": "A350-900",
        "count": 30
      },
      {
        "id": "A350-1000",
        "count": 18
      },
      {
        "id": "Boeing 777-300",
        "count": 17
      },
      {
        "id": "777-300ER",
        "count": 35
      }
    ],
    "source": "https://www.cathaypacific.com/content/dam/cx/about-us/investor-relations/interim-annual-reports/en/2025_cx_interim_report_en.pdf",
    "asOf": "2025-06-30",
    "basis": "snapshot",
    "note": "宽体为主，A320/A321neo 承担部分区域航班；不含香港快运和 747 货机。",
    "growth": [
      "Airbus A320/A321neo",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "UO": {
    "mix": [
      {
        "id": "A320-200",
        "count": 6
      },
      {
        "id": "A320neo",
        "count": 10
      },
      {
        "id": "A321-200",
        "count": 13
      },
      {
        "id": "A321neo",
        "count": 12
      }
    ],
    "source": "https://www.cathaypacific.com/content/dam/cx/about-us/investor-relations/interim-annual-reports/en/2025_cx_interim_report_en.pdf",
    "asOf": "2025-06-30",
    "basis": "snapshot",
    "note": "全空客窄体低成本机队，独立于国泰客运机队。",
    "growth": [
      "A321neo"
    ],
    "scope": "客运机队"
  },
  "NH": {
    "mix": [
      {
        "id": "Boeing 777-300 系列",
        "count": 16
      },
      {
        "id": "Boeing 777-200 系列",
        "count": 10
      },
      {
        "id": "787-10",
        "count": 10
      },
      {
        "id": "787-9",
        "count": 44
      },
      {
        "id": "787-8",
        "count": 36
      },
      {
        "id": "Boeing 767-300",
        "count": 15
      },
      {
        "id": "737-800",
        "count": 39
      },
      {
        "id": "A380-800",
        "count": 3
      },
      {
        "id": "Airbus A321LR",
        "count": 3
      },
      {
        "id": "A321neo",
        "count": 22
      },
      {
        "id": "A321-200",
        "count": 4
      },
      {
        "id": "A320neo",
        "count": 33
      },
      {
        "id": "A320-200",
        "count": 13
      },
      {
        "id": "De Havilland Dash 8-400",
        "count": 25
      }
    ],
    "source": "https://www.ana.co.jp/group/company/ana/scale/",
    "asOf": "2026-03-31",
    "basis": "snapshot",
    "note": "787 为宽体主力，3 架 A380 为特色大型机；按官方口径剔除 16 架货机。",
    "growth": [
      "787-9",
      "A321neo"
    ],
    "scope": "客运机队"
  },
  "KE": {
    "mix": [
      {
        "id": "A380-800",
        "count": 5
      },
      {
        "id": "747-8",
        "count": 4
      },
      {
        "id": "Boeing 777-300/300ER",
        "count": 29
      },
      {
        "id": "Boeing 787-9/10",
        "count": 32
      },
      {
        "id": "A330-300",
        "count": 17
      },
      {
        "id": "Boeing 737 系列",
        "count": 23
      },
      {
        "id": "A321neo",
        "count": 20
      },
      {
        "id": "A220-300",
        "count": 10
      },
      {
        "id": "A350-900",
        "count": 3
      }
    ],
    "source": "https://www.koreanair.com/contents/footer/about-us/who-we-are/overview/introduce-corporation?hl=th",
    "asOf": "2026-09",
    "basis": "snapshot",
    "note": "保留 A380、747-8 等大型客机；不含韩亚和 23 架货机，合并型号遵循官方披露。",
    "growth": [
      "Boeing 787-9/10",
      "A321neo",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "EY": {
    "mix": [
      {
        "id": "Boeing 787 系列",
        "count": 48
      },
      {
        "id": "Airbus A320 系列",
        "count": 20
      },
      {
        "id": "Airbus A321",
        "count": 15
      },
      {
        "id": "Airbus A321LR",
        "count": 11
      },
      {
        "id": "Airbus A350",
        "count": 10
      },
      {
        "id": "Boeing 777",
        "count": 9
      },
      {
        "id": "A380-800",
        "count": 7
      },
      {
        "id": "Airbus A330",
        "count": 2
      }
    ],
    "source": "https://www.etihad.com/en-il/news/etihad-reports-february-2026-traffic-statistics",
    "asOf": "2026-02",
    "basis": "snapshot",
    "note": "远程宽体与区域窄体并存；不含 6 架 777F。",
    "growth": [
      "Boeing 787 系列",
      "Airbus A321LR"
    ],
    "scope": "客运机队"
  },
  "LH": {
    "mix": [
      {
        "id": "Airbus A319",
        "count": 40
      },
      {
        "id": "A320-200",
        "count": 62
      },
      {
        "id": "A320neo",
        "count": 41
      },
      {
        "id": "A321-200",
        "count": 54
      },
      {
        "id": "A321neo",
        "count": 18
      },
      {
        "id": "Airbus A330",
        "count": 21
      },
      {
        "id": "Airbus A340",
        "count": 23
      },
      {
        "id": "Airbus A350",
        "count": 31
      },
      {
        "id": "A380-800",
        "count": 8
      },
      {
        "id": "Boeing 747 系列",
        "count": 27
      },
      {
        "id": "Boeing 787",
        "count": 12
      },
      {
        "id": "Bombardier CRJ",
        "count": 23
      },
      {
        "id": "Embraer 区域机队",
        "count": 27
      }
    ],
    "source": "https://report.lufthansagroup.com/2025/annual-report/en/combined-management-report/principles-of-the-group/fleet-and-route-network/fleet/",
    "asOf": "2025-12-31",
    "basis": "snapshot",
    "note": "官方 LH 统计包括区域航司及 Discover，不包括瑞士、奥地利与汉莎货运；保留存量大型机。",
    "growth": [
      "Airbus A350",
      "Boeing 787",
      "A320neo"
    ],
    "scope": "LH 统计口径（含区域航司及 Discover）"
  },
  "LX": {
    "mix": [
      {
        "id": "Airbus A220",
        "count": 30
      },
      {
        "id": "A320-200",
        "count": 23
      },
      {
        "id": "A320neo",
        "count": 11
      },
      {
        "id": "A321-200",
        "count": 6
      },
      {
        "id": "A321neo",
        "count": 7
      },
      {
        "id": "Airbus A330",
        "count": 14
      },
      {
        "id": "Airbus A340",
        "count": 8
      },
      {
        "id": "Airbus A350",
        "count": 5
      },
      {
        "id": "Boeing 777",
        "count": 12
      }
    ],
    "source": "https://report.lufthansagroup.com/2025/annual-report/en/combined-management-report/principles-of-the-group/fleet-and-route-network/fleet/",
    "asOf": "2025-12-31",
    "basis": "snapshot",
    "note": "官方 LX 口径包括 Edelweiss，非瑞士国际航空单体数量。",
    "growth": [
      "Airbus A350",
      "A320neo"
    ],
    "scope": "LX 统计口径（含 Edelweiss）"
  },
  "OS": {
    "mix": [
      {
        "id": "A320-200",
        "count": 29
      },
      {
        "id": "A320neo",
        "count": 5
      },
      {
        "id": "A321-200",
        "count": 6
      },
      {
        "id": "Boeing 767",
        "count": 3
      },
      {
        "id": "Boeing 777",
        "count": 6
      },
      {
        "id": "Boeing 787",
        "count": 2
      },
      {
        "id": "Embraer 区域机队",
        "count": 16
      }
    ],
    "source": "https://report.lufthansagroup.com/2025/annual-report/en/combined-management-report/principles-of-the-group/fleet-and-route-network/fleet/",
    "asOf": "2025-12-31",
    "basis": "snapshot",
    "note": "区域与欧洲窄体网络配合少量洲际宽体。",
    "growth": [
      "Boeing 787",
      "A320neo"
    ],
    "scope": "客运机队"
  },
  "UA": {
    "mix": [
      {
        "id": "777-300ER",
        "count": 22
      },
      {
        "id": "Boeing 777-200ER",
        "count": 55
      },
      {
        "id": "Boeing 777-200",
        "count": 19
      },
      {
        "id": "787-10",
        "count": 21
      },
      {
        "id": "787-9",
        "count": 41
      },
      {
        "id": "787-8",
        "count": 12
      },
      {
        "id": "Boeing 767-400ER",
        "count": 16
      },
      {
        "id": "Boeing 767-300ER",
        "count": 37
      },
      {
        "id": "Boeing 757-300",
        "count": 21
      },
      {
        "id": "Boeing 757-200",
        "count": 40
      },
      {
        "id": "737-9",
        "count": 85
      },
      {
        "id": "737-8",
        "count": 107
      },
      {
        "id": "737-900ER",
        "count": 136
      },
      {
        "id": "Boeing 737-900",
        "count": 12
      },
      {
        "id": "737-800",
        "count": 141
      },
      {
        "id": "Boeing 737-700",
        "count": 40
      },
      {
        "id": "A321neo",
        "count": 29
      },
      {
        "id": "A320-200",
        "count": 79
      },
      {
        "id": "Airbus A319-100",
        "count": 81
      }
    ],
    "source": "https://ir.united.com/static-files/d4c854c7-427c-49a9-8129-d43c97e5c14e",
    "asOf": "2024-12-31",
    "basis": "snapshot",
    "note": "美联航主线口径，不含 United Express；保留官方披露的存量 757/767，订单不计入在役。",
    "growth": [
      "737-8",
      "A321neo",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "QR": {
    "mix": [
      {
        "id": "777-300ER",
        "count": 57
      },
      {
        "id": "777-200LR",
        "count": 9
      },
      {
        "id": "A350-900",
        "count": 34
      },
      {
        "id": "A350-1000",
        "count": 24
      },
      {
        "id": "787-8",
        "count": 30
      },
      {
        "id": "787-9",
        "count": 21
      },
      {
        "id": "A380-800",
        "count": 8
      },
      {
        "id": "A320-200",
        "count": 25
      },
      {
        "id": "A330-300",
        "count": 10
      },
      {
        "id": "A330-200",
        "count": 5
      }
    ],
    "source": "https://www.qatarairways.com/en-qa/fleet.html",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "机型来自官方机队页，数量为游戏配置；宽体为主，保留 A320 区域网络。",
    "growth": [
      "A350-1000",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "QF": {
    "mix": [
      {
        "id": "737-800",
        "count": 75
      },
      {
        "id": "A330-200",
        "count": 16
      },
      {
        "id": "A330-300",
        "count": 10
      },
      {
        "id": "787-9",
        "count": 14
      },
      {
        "id": "A380-800",
        "count": 10
      },
      {
        "id": "A321XLR",
        "count": 3
      },
      {
        "id": "A220-300",
        "count": 7
      }
    ],
    "source": "https://www.qantas.com/en-us/onboard/fleet",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "国内 737 与洲际 A330/787/A380 分工；数量为游戏配置，未来 A350 不算已交付。区域伙伴未逐一纳入。",
    "growth": [
      "A321XLR",
      "A220-300",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "BA": {
    "mix": [
      {
        "id": "Airbus A319-100",
        "count": 25
      },
      {
        "id": "A320-200",
        "count": 60
      },
      {
        "id": "A320neo",
        "count": 25
      },
      {
        "id": "A321-200",
        "count": 15
      },
      {
        "id": "A321neo",
        "count": 15
      },
      {
        "id": "A350-1000",
        "count": 18
      },
      {
        "id": "A380-800",
        "count": 12
      },
      {
        "id": "Boeing 777-200ER",
        "count": 40
      },
      {
        "id": "777-300ER",
        "count": 16
      },
      {
        "id": "787-8",
        "count": 12
      },
      {
        "id": "787-9",
        "count": 18
      },
      {
        "id": "787-10",
        "count": 8
      },
      {
        "id": "E190",
        "count": 20
      }
    ],
    "source": "https://www.britishairways.com/content/en/gb/information/about-ba/fleet-facts",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "官方机型包含 BA CityFlyer E190；数量为游戏配置，A380 保留固定存量。",
    "growth": [
      "A320neo",
      "A350-1000",
      "787-10"
    ],
    "scope": "英航及 BA CityFlyer 客运参考"
  },
  "VS": {
    "mix": [
      {
        "id": "A350-1000",
        "count": 12
      },
      {
        "id": "787-9",
        "count": 17
      },
      {
        "id": "A330-900",
        "count": 10
      },
      {
        "id": "A330-300",
        "count": 5
      }
    ],
    "source": "https://flywith.virginatlantic.com/us/en/on-the-flight/cabin-and-seats/meet-our-fleet.html",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "全宽体远程航司，没有 A320 或 737；数量为游戏配置。",
    "growth": [
      "A330-900",
      "A350-1000"
    ],
    "scope": "客运机队"
  },
  "WN": {
    "mix": [
      {
        "id": "Boeing 737-700",
        "count": 320
      },
      {
        "id": "737-800",
        "count": 200
      },
      {
        "id": "737-8",
        "count": 283
      }
    ],
    "source": "https://investors.southwest.com/sec-filings/all-sec-filings/content/0000092380-26-000002/er-12312025xerdoc.htm",
    "asOf": "2025-12-31",
    "basis": "types",
    "note": "803 架总量参考官方年末公告；子型号占比为游戏配置，全 737 机队。未交付 MAX 7 不计入。",
    "growth": [
      "737-8"
    ],
    "scope": "客运机队"
  },
  "U2": {
    "mix": [
      {
        "id": "Airbus A319",
        "count": 60
      },
      {
        "id": "A320-200",
        "count": 170
      },
      {
        "id": "A320neo",
        "count": 75
      },
      {
        "id": "A321neo",
        "count": 35
      }
    ],
    "source": "https://www.easyjet.com/en/traveller/best-of-europe/what-planes-does-easyjet-use",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "全 A320 家族欧洲短途低成本网络；数量为游戏配置。",
    "growth": [
      "A320neo",
      "A321neo"
    ],
    "scope": "客运机队"
  },
  "JL": {
    "mix": [
      {
        "id": "737-800",
        "count": 60
      },
      {
        "id": "Boeing 767-300ER",
        "count": 25
      },
      {
        "id": "787-8",
        "count": 28
      },
      {
        "id": "787-9",
        "count": 22
      },
      {
        "id": "777-300ER",
        "count": 10
      },
      {
        "id": "A350-1000",
        "count": 10
      },
      {
        "id": "A350-900",
        "count": 16
      }
    ],
    "source": "https://press.jal.co.jp/en/items/uploads/JAL_MRP2025_E_r1.pdf",
    "asOf": "2025 机队规划",
    "basis": "types",
    "note": "A350/787 承担大型与远程网络，737 承担短途；数量为游戏配置，不把未来 A321 订单列为在役。",
    "growth": [
      "A350-1000",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "KL": {
    "mix": [
      {
        "id": "Boeing 737-700",
        "count": 5
      },
      {
        "id": "737-800",
        "count": 30
      },
      {
        "id": "Boeing 737-900",
        "count": 5
      },
      {
        "id": "A321neo",
        "count": 10
      },
      {
        "id": "A330-200",
        "count": 6
      },
      {
        "id": "A330-300",
        "count": 5
      },
      {
        "id": "Boeing 777-200ER",
        "count": 15
      },
      {
        "id": "777-300ER",
        "count": 16
      },
      {
        "id": "787-9",
        "count": 13
      },
      {
        "id": "787-10",
        "count": 10
      },
      {
        "id": "E175",
        "count": 17
      },
      {
        "id": "E190",
        "count": 30
      },
      {
        "id": "E195-E2",
        "count": 25
      }
    ],
    "source": "https://www.klm.com/information/travel-class-extra-options/aircraft-types",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "包括 Cityhopper 的 Embraer 支线机；数量为游戏配置，不将预告交付的 A350 当成当前机队。",
    "growth": [
      "A321neo",
      "E195-E2",
      "787-10"
    ],
    "scope": "荷航及 Cityhopper 客运参考"
  },
  "DL": {
    "mix": [
      {
        "id": "A220-100",
        "count": 45
      },
      {
        "id": "A220-300",
        "count": 40
      },
      {
        "id": "Airbus A319-100",
        "count": 55
      },
      {
        "id": "A320-200",
        "count": 60
      },
      {
        "id": "A321-200",
        "count": 120
      },
      {
        "id": "A321neo",
        "count": 90
      },
      {
        "id": "A330-200",
        "count": 11
      },
      {
        "id": "A330-300",
        "count": 31
      },
      {
        "id": "A330-900",
        "count": 40
      },
      {
        "id": "A350-900",
        "count": 40
      },
      {
        "id": "737-800",
        "count": 70
      },
      {
        "id": "737-900ER",
        "count": 160
      },
      {
        "id": "Boeing 717-200",
        "count": 70
      },
      {
        "id": "Boeing 757 系列",
        "count": 110
      },
      {
        "id": "Boeing 767 系列",
        "count": 58
      }
    ],
    "source": "https://www.delta.com/us/en/aircraft/overview",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "达美主线机型参考，不含 Connection 区域承运商；无 787 和 A380，数量为游戏配置。",
    "growth": [
      "A321neo",
      "A220-300",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "AA": {
    "mix": [
      {
        "id": "Airbus A319-100",
        "count": 130
      },
      {
        "id": "A320-200",
        "count": 48
      },
      {
        "id": "A321-200",
        "count": 220
      },
      {
        "id": "A321neo",
        "count": 90
      },
      {
        "id": "A321XLR",
        "count": 5
      },
      {
        "id": "737-800",
        "count": 300
      },
      {
        "id": "737-8",
        "count": 75
      },
      {
        "id": "Boeing 777-200ER",
        "count": 47
      },
      {
        "id": "777-300ER",
        "count": 20
      },
      {
        "id": "787-8",
        "count": 37
      },
      {
        "id": "787-9",
        "count": 28
      }
    ],
    "source": "https://www.aa.com/web/i18n/travel-info/experience/planes/planes.html?locale=en_VC",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "主线窄体占多数，洲际以 777/787 为主；数量为游戏配置，不含 American Eagle。",
    "growth": [
      "A321neo",
      "737-8",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "CA": {
    "mix": [
      {
        "id": "Airbus A320 系列",
        "count": 190
      },
      {
        "id": "Boeing 737 系列",
        "count": 160
      },
      {
        "id": "Airbus A330",
        "count": 55
      },
      {
        "id": "A350-900",
        "count": 30
      },
      {
        "id": "777-300ER",
        "count": 28
      },
      {
        "id": "787-9",
        "count": 14
      },
      {
        "id": "Boeing 747 系列",
        "count": 7
      },
      {
        "id": "C919",
        "count": 3
      },
      {
        "id": "C909",
        "count": 3
      }
    ],
    "source": "https://webresource.airchina.com.cn/airchinacms/2/upload/resources/file/10109.pdf",
    "asOf": "2024 年报",
    "basis": "types",
    "note": "机型参考集团年报，单体规模与占比为游戏配置；不直接套用包含深航、山航的集团总数。",
    "growth": [
      "Airbus A320 系列",
      "C919",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "MU": {
    "mix": [
      {
        "id": "Airbus A320 系列",
        "count": 300
      },
      {
        "id": "Boeing 737 系列",
        "count": 140
      },
      {
        "id": "Airbus A330",
        "count": 50
      },
      {
        "id": "A350-900",
        "count": 20
      },
      {
        "id": "777-300ER",
        "count": 20
      },
      {
        "id": "787-9",
        "count": 10
      },
      {
        "id": "C919",
        "count": 12
      },
      {
        "id": "C909",
        "count": 20
      }
    ],
    "source": "https://global.ceair.com/global/static/AboutChinaEasternAirlines/intoEasternAirlines/InvestorRelations/announcement/ShanghaiExchangeReleased/shExcReleased2024/202412/P020241217319650133626.pdf",
    "asOf": "2024 官方机队披露",
    "basis": "types",
    "note": "A320 家族为主并配置国产机；单体数量为游戏配置，不复制包括上航等企业的集团总量。",
    "growth": [
      "Airbus A320 系列",
      "C919",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "CZ": {
    "mix": [
      {
        "id": "Airbus A320 系列",
        "count": 240
      },
      {
        "id": "Boeing 737 系列",
        "count": 250
      },
      {
        "id": "Airbus A330",
        "count": 35
      },
      {
        "id": "A350-900",
        "count": 20
      },
      {
        "id": "Boeing 787 系列",
        "count": 27
      },
      {
        "id": "777-300ER",
        "count": 16
      },
      {
        "id": "C919",
        "count": 5
      },
      {
        "id": "C909",
        "count": 27
      }
    ],
    "source": "https://www.csair.cn/cn/about/investor/qitabaogao/2025/resource/972b4c333876723ad8f1a98e37e8c8ca.pdf",
    "asOf": "2025 官方机队披露",
    "basis": "types",
    "note": "窄体干线为主、宽体覆盖洲际；数量为游戏配置，不包含厦航等独立档案，不再配置 A380。",
    "growth": [
      "Airbus A320 系列",
      "C919",
      "Boeing 787 系列"
    ],
    "scope": "客运机队"
  },
  "HU": {
    "mix": [
      {
        "id": "737-800",
        "count": 130
      },
      {
        "id": "737-8",
        "count": 12
      },
      {
        "id": "787-8",
        "count": 10
      },
      {
        "id": "787-9",
        "count": 28
      },
      {
        "id": "A330-300",
        "count": 10
      },
      {
        "id": "A330-200",
        "count": 10
      }
    ],
    "source": "https://www.hainanairlines.com/HUPortal/dyn/portal/DisplayPage?COUNTRY_SITE=TH&LANGUAGE=TW&PAGE=FLET&SITE=CBHZCBHZ",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "737 国内干线配合 787/A330 宽体；数量为游戏配置，不含首都、西部等海航系航司。",
    "growth": [
      "737-8",
      "787-9"
    ],
    "scope": "客运机队"
  },
  "3U": {
    "mix": [
      {
        "id": "Airbus A320 系列",
        "count": 185
      },
      {
        "id": "Airbus A330",
        "count": 11
      },
      {
        "id": "A350-900",
        "count": 9
      }
    ],
    "source": "https://www.scalgroup.cn/newsdetail/77255.html",
    "asOf": "2025 官方新闻",
    "basis": "types",
    "note": "全空客客运机队，A320 家族为主；A350 参考第九架交付新闻，其余数量为游戏配置。",
    "growth": [
      "Airbus A320 系列",
      "A350-900"
    ],
    "scope": "客运机队"
  },
  "MF": {
    "mix": [
      {
        "id": "Boeing 737 系列",
        "count": 150
      },
      {
        "id": "787-8",
        "count": 6
      },
      {
        "id": "787-9",
        "count": 6
      },
      {
        "id": "A321neo",
        "count": 12
      }
    ],
    "source": "https://rescms.xiamenair.cn/brandnew_CN/channels/4638.html",
    "asOf": "2026-10-24 机型核查",
    "basis": "types",
    "note": "737 为主、787 远程，已引入 A321neo，不能继续按纯波音机队处理。数量为游戏配置。",
    "growth": [
      "Boeing 737 系列",
      "A321neo",
      "787-9"
    ],
    "scope": "客运机队"
  }
};
if(typeof module!=='undefined')module.exports=D.fleetProfiles;
})(typeof window!=='undefined'?window:globalThis);
