// DEMO sample data — fabricated for layout only. Real version: replace with API calls (see README).
const W12 = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'];
const M6 = ['May','Jun','Jul','Aug','Sep','Oct'];
const pal = (rows, cols) => rows.map((r, i) => [...r, cols[i]]);
const DATA = {
  ops: {
    modes: ['All','Sea','Air','Customs','Truck'],
    kpis: {
      All:     [['Open jobs','186','+12','up'],['Departing this week','41','+5','up'],['Delayed / at risk','9','+2','down'],['Docs pending','23','-4','up']],
      Sea:     [['Open sea jobs','98','+7','up'],['TEU this month','612','+8.4%','up'],['Vessels due ≤7d','14','0','flat'],['Delayed','5','+1','down']],
      Air:     [['Open air jobs','37','+3','up'],['Chargeable kg (MTD)','48,200','+5.1%','up'],['AWB issued today','11','-2','down'],['Delayed','2','0','flat']],
      Customs: [['Declarations open','52','+9','up'],['Cleared today','18','+4','up'],['Awaiting inspection','6','+1','down'],['Awaiting docs','11','-3','up']],
      Truck:   [['Trips today','34','+6','up'],['Fleet utilisation','78%','+3pt','up'],['Late deliveries','3','-1','up'],['Empty return pending','8','+2','down']]
    },
    pipeline: {
      Sea:     [['Booked',22,'#0ea5e9'],['Docs',18,'#6366f1'],['Loaded',16,'#f59e0b'],['Sailing',27,'#0369a1'],['Arrived',9,'#10b981'],['Delivered',6,'#64748b']],
      Air:     [['Booked',8,'#0ea5e9'],['Received',7,'#6366f1'],['Flown',12,'#0369a1'],['Arrived',6,'#10b981'],['Delivered',4,'#64748b']],
      Customs: [['Prepared',14,'#0ea5e9'],['Lodged',12,'#6366f1'],['Inspection',6,'#f59e0b'],['Duty paid',9,'#10b981'],['Released',11,'#64748b']],
      Truck:   [['Planned',9,'#0ea5e9'],['Dispatched',12,'#6366f1'],['In transit',8,'#0369a1'],['Delivered',5,'#10b981']]
    },
    volumeTitle: {All:'Jobs opened per week',Sea:'TEU per week',Air:'Chargeable kg x100 per week',Customs:'Declarations per week',Truck:'Trips per week'},
    volume: {
      All:[150,162,158,171,180,176,190,185,198,204,196,212],
      Sea:[48,52,50,58,61,55,64,60,67,70,66,74],
      Air:[92,101,88,110,104,119,98,125,117,130,122,138],
      Customs:[30,34,29,38,41,36,44,40,47,50,45,52],
      Truck:[210,224,219,231,240,236,252,247,260,268,259,275]
    },
    splitTitle: {All:'Jobs by mode',Sea:'Top trade lanes (TEU)',Air:'Top airlines (kg)',Customs:'By customs office',Truck:'By vehicle type'},
    split: {
      All:     pal([['Sea',98],['Air',37],['Customs',52],['Truck',34]], ['#0369a1','#7c3aed','#f59e0b','#10b981']),
      Sea:     pal([['BKK-LAX',142],['LCB-SIN',118],['BKK-HAM',96],['LCB-SHA',88],['Other',168]], ['#0369a1','#0ea5e9','#6366f1','#10b981','#94a3b8']),
      Air:     pal([['TG',14200],['EK',11800],['SQ',9400],['QR',7100],['Other',5700]], ['#7c3aed','#a78bfa','#6366f1','#0ea5e9','#94a3b8']),
      Customs: pal([['Laem Chabang',21],['Suvarnabhumi',17],['Bangkok Port',9],['Don Mueang',5]], ['#f59e0b','#fbbf24','#d97706','#94a3b8']),
      Truck:   pal([['6-wheel',12],['10-wheel',9],['Trailer',8],['Pickup',5]], ['#10b981','#34d399','#059669','#94a3b8'])
    },
    tableTitle: {All:'Needs attention',Sea:'Upcoming vessels',Air:'Recent AWB',Customs:'Pending clearance',Truck:'Trips today'},
    table: {
      All:{cols:['Job','Mode','Customer','Issue','Due'],pill:3,rows:[
        ['SE-26-0412','Sea','ABC Trading','Vessel delayed 2d','Oct 28'],['AE-26-0188','Air','Siam Parts','Docs missing','Oct 27'],
        ['CC-26-0931','Customs','Thai Foods','Inspection hold','Oct 27'],['TR-26-1204','Truck','Nova Retail','Late pickup','Oct 26']]},
      Sea:{cols:['Vessel / Voy','Job','POL-POD','ETD','Status'],pill:4,rows:[
        ['EVER GIVEN 042E','SE-26-0412','LCB-LAX','Oct 28','Delayed'],['MSC AURORA 118W','SE-26-0420','BKK-HAM','Oct 29','On time'],
        ['ONE HARMONY 77S','SE-26-0433','LCB-SIN','Oct 30','On time'],['CMA CGM LYRA 31N','SE-26-0441','LCB-SHA','Nov 01','On time']]},
      Air:{cols:['AWB','Job','Route','Weight kg','Status'],pill:4,rows:[
        ['217-4412 8810','AE-26-0188','BKK-FRA','820','Docs missing'],['176-2201 4471','AE-26-0191','BKK-DXB','340','Flown'],
        ['618-9034 1120','AE-26-0195','BKK-SIN','95','Arrived'],['157-7740 3305','AE-26-0199','BKK-DOH','510','Booked']]},
      Customs:{cols:['Entry','Job','Customer','Office','Status'],pill:4,rows:[
        ['A0112-26-8841','CC-26-0931','Thai Foods','LCB','Inspection'],['A0112-26-8850','CC-26-0934','ABC Trading','LCB','Awaiting docs'],
        ['A0201-26-3310','CC-26-0940','Siam Parts','BKK Air','Lodged'],['A0112-26-8862','CC-26-0944','Nova Retail','LCB','Duty pending']]},
      Truck:{cols:['Trip','Truck','Route','ETA','Status'],pill:4,rows:[
        ['TR-26-1204','70-1234','LCB-Bangna','10:30','Late'],['TR-26-1207','71-5521','BKK-Rayong','11:45','In transit'],
        ['TR-26-1210','70-8890','Bangna-LCB','13:00','Dispatched'],['TR-26-1213','72-0042','LCB-Saraburi','15:20','Planned']]}
    }
  },
  acc: {
    kpis: [['Cash & bank','฿ 18.4M','+2.1M','up'],['AR outstanding','฿ 26.9M','+1.3M','down'],['AP outstanding','฿ 19.2M','-0.8M','up'],['Net profit (MTD)','฿ 3.6M','+9.5%','up']],
    cash: {in:[2.1,2.4,1.9,2.8,2.6,3.1,2.2,2.9,3.3,2.7,3.0,3.4], out:[1.8,2.2,2.1,2.3,2.5,2.4,2.6,2.5,2.8,2.9,2.6,2.9]},
    banks: [['KBank 001-2-xxxxx','฿ 8.2M'],['SCB 402-3-xxxxx','฿ 5.6M'],['BBL 120-4-xxxxx','฿ 3.1M'],['Petty cash','฿ 0.2M'],['USD account','$ 41.5K']],
    aging: ['Current','1-30','31-60','61-90','>90'],
    ar: [11.2,8.6,4.1,2.0,1.0], ap: [9.4,6.1,2.3,1.0,0.4],
    topAR: [['ABC Trading','฿ 4.8M','31-60'],['Thai Foods Co.','฿ 3.9M','1-30'],['Nova Retail','฿ 3.2M','Current'],['Siam Parts','฿ 2.6M','>90']],
    dueAP: [['Evergreen Line','฿ 2.1M','Oct 28'],['Thai Airways Cargo','฿ 1.6M','Oct 29'],['LCB Terminal','฿ 0.9M','Oct 30'],['Fuel supplier','฿ 0.7M','Nov 01']],
    pl: {rev:[9.1,9.8,10.2,10.9,11.4,12.3], cost:[7.4,8.0,8.3,8.9,9.1,9.8]},
    gl: [['Unposted journals','14','b-warn'],['Unreconciled bank lines','37','b-warn'],['Period status (Oct)','Open','b-info'],['Trial balance','Balanced','b-ok']]
  },
  mkt: {
    kpis: [['Quotations (MTD)','128','+14','up'],['Win rate','38%','+3pt','up'],['Bookings (MTD)','94','+9','up'],['Quoted value','฿ 41.6M','+6.2%','up']],
    funnel: [['Draft',142,'#94a3b8'],['Sent',128,'#0ea5e9'],['Follow-up',74,'#6366f1'],['Won',49,'#10b981'],['Lost',31,'#ef4444']],
    qMonth: [88,97,104,112,121,128], bMonth: [61,66,72,79,85,94],
    bookMode: [['Sea FCL',46,'#0369a1'],['Sea LCL',18,'#0ea5e9'],['Air',20,'#7c3aed'],['Truck/Other',10,'#f59e0b']],
    expiring: [['QT-26-1108','ABC Trading','Oct 28','฿ 1.2M'],['QT-26-1115','Nova Retail','Oct 29','฿ 0.8M'],['QT-26-1121','Siam Parts','Oct 30','฿ 2.4M'],['QT-26-1130','Thai Foods','Nov 01','฿ 0.6M']],
    topCust: [['ABC Trading',24,'฿ 9.8M'],['Thai Foods Co.',19,'฿ 7.1M'],['Nova Retail',15,'฿ 5.4M'],['Siam Parts',12,'฿ 4.2M']],
    pendingBk: [['BK-26-0912','ABC Trading','LCB-LAX','Awaiting rate approval'],['BK-26-0918','Siam Parts','BKK-FRA','Awaiting space'],['BK-26-0921','Nova Retail','LCB-SIN','Awaiting SI']]
  }
};
