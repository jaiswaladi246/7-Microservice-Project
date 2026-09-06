import React, {useEffect, useMemo, useState} from "react";
import {request, URLs} from "./api.js";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function Pill({children, tone=""}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function Metric({label,value,hint,icon}) {
  return <div className="metric card">
    <div className="metricIcon">{icon}</div>
    <div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{hint}</small></div>
  </div>;
}

export default function App() {
  const [user,setUser] = useState(()=>JSON.parse(localStorage.getItem("poly_user")||"null"));
  const [tab,setTab] = useState("overview");
  const [products,setProducts]=useState([]);
  const [inventory,setInventory]=useState([]);
  const [orders,setOrders]=useState([]);
  const [payments,setPayments]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [analytics,setAnalytics]=useState({});
  const [cart,setCart]=useState([]);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");

  const show=(m)=>{setToast(m);setTimeout(()=>setToast(""),2200)};

  async function loadAll() {
    setError("");
    const calls = await Promise.allSettled([
      request(`${URLs.catalog}/products`),
      request(`${URLs.inventory}/inventory`),
      request(`${URLs.orders}/orders`),
      request(`${URLs.payments}/payments`),
      request(`${URLs.notifications}/notifications${user?.email?`?recipient=${encodeURIComponent(user.email)}`:""}`),
      request(`${URLs.analytics}/analytics/summary`)
    ]);
    const setters=[setProducts,setInventory,setOrders,setPayments,setNotifications,setAnalytics];
    calls.forEach((x,i)=>{if(x.status==="fulfilled") setters[i](x.value)});
    const failed=calls.filter(x=>x.status==="rejected");
    if(failed.length) setError(`${failed.length} API request(s) failed. Verify backend health endpoints.`);
  }

  useEffect(()=>{
    if(!user) return;
    const token=localStorage.getItem("poly_token");
    if(token){
      request(`${URLs.auth}/auth/me?token=${encodeURIComponent(token)}`).catch(()=>{
        localStorage.clear();
        setUser(null);
      });
    }
    loadAll();
  },[user]);

  if(!user) return <Login onLogin={(u,t)=>{
    localStorage.setItem("poly_user",JSON.stringify(u));
    localStorage.setItem("poly_token",t);
    setUser(u);
  }}/>;

  const addCart=(p)=> {
    setCart(c=>{
      const found=c.find(x=>x.id===p.id);
      return found?c.map(x=>x.id===p.id?{...x,quantity:x.quantity+1}:x):[...c,{...p,quantity:1}];
    });
    show("Added to cart");
  };

  const checkout=async()=>{
    if(!cart.length)return;
    try{
      const o=await request(`${URLs.orders}/orders`,{
        method:"POST",
        body:JSON.stringify({
          user_email:user.email,
          items:cart.map(x=>({product_id:x.id,quantity:x.quantity}))
        })
      });
      setCart([]);
      await loadAll();
      setTab("orders");
      show(`Order #${o.id} created`);
    }catch(e){setError(e.message)}
  };

  const pay=async(o)=>{
    try{
      await request(`${URLs.payments}/payments`,{
        method:"POST",
        body:JSON.stringify({orderId:o.id,amount:Number(o.total),method:"CARD",recipient:user.email})
      });
      await loadAll(); show(`Order #${o.id} paid`);
    }catch(e){setError(e.message)}
  };

  const cancelOrder=async(o)=>{
    try{
      await request(`${URLs.orders}/orders/${o.id}/status`,{
        method:"PUT",body:JSON.stringify({status:"CANCELLED"})
      });
      await loadAll();show(`Order #${o.id} cancelled and reservation released`);
    }catch(e){setError(e.message)}
  };

  const advanceOrder=async(o)=>{
    const next=o.status==="PAID"?"PROCESSING":o.status==="PROCESSING"?"SHIPPED":null;
    if(!next)return;
    try{
      await request(`${URLs.orders}/orders/${o.id}/status`,{
        method:"PUT",body:JSON.stringify({status:next})
      });
      await loadAll();show(`Order #${o.id} moved to ${next}`);
    }catch(e){setError(e.message)}
  };

  const refund=async(p)=>{
    try{
      await request(`${URLs.payments}/payments/${p.id}/refund`,{method:"POST"});
      await loadAll();show(`Payment #${p.id} refunded`);
    }catch(e){setError(e.message)}
  };

  const adjust=async(id,delta)=>{
    try{
      await request(`${URLs.inventory}/inventory/${id}/adjust`,{
        method:"POST",body:JSON.stringify({delta})
      });
      await loadAll();show("Stock updated");
    }catch(e){setError(e.message)}
  };

  const markRead=async(id)=>{
    await request(`${URLs.notifications}/notifications/${id}/read`,{method:"POST"});
    await loadAll();
  };

  const snapshot=async()=>{
    try{
      await request(`${URLs.analytics}/analytics/snapshot`,{method:"POST"});
      show("Analytics snapshot saved");
    }catch(e){setError(e.message)}
  };

  const logout=()=>{localStorage.clear();setUser(null)};
  const unread=notifications.filter(x=>!x.is_read).length;
  const low=inventory.filter(x=>x.low_stock).length;

  const nav=[
    ["overview","◈","Overview"],["catalog","◫","Catalog"],["orders","◎","Orders & Cart"],
    ["inventory","▦","Inventory"],["payments","◇","Payments"],
    ["notifications","◌",`Notifications ${unread?`(${unread})`:""}`],["analytics","⌁","Analytics"]
  ];

  return <div className="shell">
    <aside>
      <div className="brand"><b>DS</b><div><strong>Polyglot Commerce</strong><small>DevOps Shack</small></div></div>
      <nav>{nav.map(([k,i,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}><span>{i}</span>{l}</button>)}</nav>
      <div className="stack"><span className="eyebrow">7 LANGUAGES</span><p>Java · Go · Node.js · Python · C# · Ruby · PHP</p><small>● All local, no Docker required</small></div>
    </aside>

    <main>
      <header>
        <div><span className="eyebrow">MICROSERVICE CONTROL CENTER</span><h1>{nav.find(x=>x[0]===tab)?.[2]}</h1></div>
        <div className="headerActions">
          <button className="secondary" onClick={loadAll}>↻ Refresh</button>
          <div className="user"><b>{user.name?.[0]||"U"}</b><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
          <button className="secondary" onClick={logout}>Logout</button>
        </div>
      </header>

      {error&&<div className="alert">⚠ {error}<button onClick={()=>setError("")}>×</button></div>}
      {toast&&<div className="toast">{toast}</div>}

      {tab==="overview"&&<>
        <section className="hero card">
          <div><Pill tone="blue">POLYGLOT MICROSERVICES</Pill><h2>Seven independent backends.<br/>One seamless product.</h2>
          <p>Every backend owns its data and communicates over REST. Run the entire platform directly on your machine.</p>
          <div className="actions"><button className="primary" onClick={()=>setTab("catalog")}>Browse products →</button><button className="secondary" onClick={()=>setTab("analytics")}>View analytics</button></div></div>
          <div className="orb"><b>REST</b>{["Java","Go","Node","Python","C#","Ruby","PHP"].map((x,i)=><span key={x} style={{"--i":i}}>{x}</span>)}</div>
        </section>

        <div className="metrics">
          <Metric label="CAPTURED REVENUE" value={money(analytics.captured_revenue)} hint={`${payments.length} payment record(s)`} icon="$"/>
          <Metric label="ORDERS" value={analytics.orders??orders.length} hint={`${orders.filter(x=>x.status==="PAID").length} paid`} icon="◎"/>
          <Metric label="PRODUCTS" value={analytics.products??products.length} hint="Go Catalog Service" icon="◫"/>
          <Metric label="LOW STOCK" value={analytics.low_stock_count??low} hint="Node Inventory Service" icon="!"/>
        </div>

        <div className="cols">
          <Panel title="Recent orders" eyebrow="LATEST">
            <OrderTable orders={orders.slice(0,5)} pay={pay} cancel={cancelOrder} advance={advanceOrder}/>
          </Panel>
          <Panel title="Service map" eyebrow="HEALTH">
            <div className="services">
              {[["Auth","Java",8081],["Catalog","Go",8082],["Inventory","Node",8083],["Orders","Python",8084],["Payments","C#",8085],["Notify","Ruby",8086],["Analytics","PHP",8087]]
              .map(([n,l,p])=><div key={n}><i/><strong>{n}</strong><span>{l}</span><code>:{p}</code></div>)}
            </div>
          </Panel>
        </div>
      </>}

      {tab==="catalog"&&<Catalog products={products} inventory={inventory} add={addCart} reload={loadAll} setError={setError}/>}

      {tab==="orders"&&<>
        <div className="sectionTitle"><div><span className="eyebrow">PYTHON ORCHESTRATION</span><h2>Orders & Cart</h2></div><Pill>{cart.reduce((s,x)=>s+x.quantity,0)} unit(s)</Pill></div>
        <div className="card cart">
          <div className="panelHead"><div><span className="eyebrow">ACTIVE CART</span><h3>{cart.length?"Ready to checkout":"Cart is empty"}</h3></div><strong>{money(cart.reduce((s,x)=>s+x.price*x.quantity,0))}</strong></div>
          {cart.map(x=><div className="cartLine" key={x.id}><span>{x.image}</span><div><strong>{x.name}</strong><small>{money(x.price)} each</small></div>
            <div className="qty"><button onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,quantity:Math.max(1,y.quantity-1)}:y))}>−</button><b>{x.quantity}</b><button onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,quantity:y.quantity+1}:y))}>+</button></div>
            <strong>{money(x.price*x.quantity)}</strong><button className="secondary" onClick={()=>setCart(c=>c.filter(y=>y.id!==x.id))}>×</button>
          </div>)}
          {cart.length?<button className="primary wide" onClick={checkout}>Create Order · {money(cart.reduce((s,x)=>s+x.price*x.quantity,0))}</button>:<p className="muted">Add products from the Catalog tab.</p>}
        </div>
        <Panel title="Order database" eyebrow="ORDER SERVICE"><OrderTable orders={orders} pay={pay} cancel={cancelOrder} advance={advanceOrder}/></Panel>
      </>}

      {tab==="inventory"&&<>
        <div className="sectionTitle"><div><span className="eyebrow">NODE.JS SERVICE</span><h2>Inventory Operations</h2></div><Pill tone={low?"amber":"green"}>{low} low-stock</Pill></div>
        <div className="grid3">{inventory.map(x=>{
          const p=products.find(y=>y.id===Number(x.product_id));
          return <div className="card stockCard" key={x.product_id}><div className="productIcon">{p?.image||"📦"}</div><span className="eyebrow">PRODUCT #{x.product_id}</span><h3>{p?.name||"Unknown"}</h3>
            <div className="stockNo">{x.available}<small> available</small></div><p>Total {x.quantity} · Reserved {x.reserved} · Reorder {x.reorder_level}</p>
            <div className="actions"><button className="secondary" onClick={()=>adjust(x.product_id,-5)}>−5</button><button className="secondary" onClick={()=>adjust(x.product_id,5)}>+5</button><button className="secondary" onClick={()=>adjust(x.product_id,25)}>+25</button></div>
            {x.low_stock&&<Pill tone="amber">Reorder needed</Pill>}
          </div>
        })}</div>
      </>}

      {tab==="payments"&&<>
        <div className="sectionTitle"><div><span className="eyebrow">C# / ASP.NET CORE</span><h2>Payment Ledger</h2></div><Pill tone="green">{money(analytics.captured_revenue)} captured</Pill></div>
        <Panel title="Payments" eyebrow="PAYMENT DATABASE">
          <table><thead><tr><th>ID</th><th>Order</th><th>Amount</th><th>Method</th><th>Status</th><th>Transaction</th><th/></tr></thead>
          <tbody>{payments.map(p=><tr key={p.id}><td>#{p.id}</td><td>#{p.orderId}</td><td><strong>{money(p.amount)}</strong></td><td>{p.method}</td><td><Pill tone={p.status==="CAPTURED"?"green":"amber"}>{p.status}</Pill></td><td><code>{p.transactionRef}</code></td><td>{p.status==="CAPTURED"&&<button className="danger" onClick={()=>refund(p)}>Refund</button>}</td></tr>)}
          {!payments.length&&<tr><td colSpan="7" className="empty">No payments yet.</td></tr>}</tbody></table>
        </Panel>
      </>}

      {tab==="notifications"&&<>
        <div className="sectionTitle"><div><span className="eyebrow">RUBY / SINATRA</span><h2>Notification Inbox</h2></div><Pill tone="blue">{unread} unread</Pill></div>
        <div className="noticeList">{notifications.map(n=><div className={`card notice ${n.is_read?"read":""}`} key={n.id}>
          <div className="noticeIcon">{n.type==="PAYMENT"?"$":n.type==="ORDER"?"◎":n.type==="REFUND"?"↩":"✦"}</div>
          <div className="grow"><div className="panelHead"><strong>{n.subject}</strong><Pill>{n.type}</Pill></div><p>{n.message}</p><small>{n.created_at}</small></div>
          {!n.is_read&&<button className="secondary" onClick={()=>markRead(n.id)}>Mark read</button>}
        </div>)}</div>
      </>}

      {tab==="analytics"&&<>
        <div className="sectionTitle"><div><span className="eyebrow">PHP AGGREGATION</span><h2>Live Analytics</h2></div><button className="primary" onClick={snapshot}>Save DB Snapshot</button></div>
        <div className="metrics">
          <Metric label="CAPTURED REVENUE" value={money(analytics.captured_revenue)} hint={`Refunded ${money(analytics.refunded_amount)}`} icon="$"/>
          <Metric label="GROSS ORDER VALUE" value={money(analytics.gross_order_value)} hint={`AOV ${money(analytics.average_order_value)}`} icon="Σ"/>
          <Metric label="TOTAL ORDERS" value={analytics.orders||0} hint={`${analytics.payments||0} payments`} icon="◎"/>
          <Metric label="LOW STOCK SKUS" value={analytics.low_stock_count||0} hint={`${analytics.products||0} products`} icon="!"/>
        </div>
        <div className="cols">
          <Panel title="Order lifecycle" eyebrow="STATUS BREAKDOWN">
            <div className="bars">{Object.entries(analytics.order_status||{}).map(([k,v])=>{
              const max=Math.max(1,...Object.values(analytics.order_status||{x:1}));
              return <div className="bar" key={k}><span>{k}</span><div><i style={{width:`${v/max*100}%`}}/></div><strong>{v}</strong></div>
            })}</div>
          </Panel>
          <Panel title="Polyglot stack" eyebrow="LANGUAGES">
            <div className="langGrid">{(analytics.languages||["Java","Go","Node.js","Python","C#","Ruby","PHP"]).map((x,i)=><div key={x}><span>{String(i+1).padStart(2,"0")}</span><strong>{x}</strong></div>)}</div>
          </Panel>
        </div>
      </>}
    </main>
  </div>;
}

function Login({onLogin}) {
  const [mode,setMode]=useState("login");
  const [form,setForm]=useState({name:"",email:"admin@devopsshack.com",password:"admin123"});
  const [error,setError]=useState("");
  async function submit(e){
    e.preventDefault();setError("");
    try{
      if(mode==="register") await request(`${URLs.auth}/auth/register`,{method:"POST",body:JSON.stringify(form)});
      const data=await request(`${URLs.auth}/auth/login`,{method:"POST",body:JSON.stringify({email:form.email,password:form.password})});
      onLogin(data.user,data.token);
    }catch(e){setError(e.message)}
  }
  return <div className="loginPage">
    <section className="loginVisual"><div className="brand light"><b>DS</b><div><strong>DevOps Shack</strong><small>Polyglot Microservices Lab</small></div></div>
      <div><Pill tone="blue">HANDS-ON ARCHITECTURE</Pill><h1>Seven languages.<br/>One microservice platform.</h1><p>Learn database ownership, REST communication and independent services using one complete application.</p></div>
      <div className="tech">{["Java","Go","Node.js","Python","C#","Ruby","PHP"].map(x=><span key={x}>{x}</span>)}</div>
    </section>
    <form className="card loginCard" onSubmit={submit}><span className="eyebrow">LOCAL DEMO ACCESS</span><h2>{mode==="login"?"Welcome back":"Create account"}</h2>
      {error&&<div className="alert">{error}</div>}
      {mode==="register"&&<label>Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}
      <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      <label>Password<input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
      <button className="primary wide">{mode==="login"?"Sign in →":"Register & sign in →"}</button>
      <button type="button" className="link" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Need an account? Register":"Already registered? Sign in"}</button>
      <div className="demo"><strong>Demo</strong><span>admin@devopsshack.com</span><code>admin123</code></div>
    </form>
  </div>
}

function Catalog({products,inventory,add,reload,setError}) {
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const [f,setF]=useState({name:"",category:"Workspace",description:"",price:25,image:"📦"});
  const filtered=useMemo(()=>products.filter(p=>`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q.toLowerCase())),[products,q]);

  async function create(e){
    e.preventDefault();
    try{
      const p=await request(`${URLs.catalog}/products`,{method:"POST",body:JSON.stringify({...f,price:Number(f.price)})});
      await request(`${URLs.inventory}/inventory/${p.id}/adjust`,{method:"POST",body:JSON.stringify({delta:30})});
      setOpen(false);setF({name:"",category:"Workspace",description:"",price:25,image:"📦"});await reload();
    }catch(e){setError(e.message)}
  }

  return <>
    <div className="sectionTitle"><div><span className="eyebrow">GO CATALOG SERVICE</span><h2>Product Catalog</h2></div>
      <div className="actions"><input className="search" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)}/><button className="primary" onClick={()=>setOpen(!open)}>+ New Product</button></div>
    </div>
    {open&&<form className="card productForm" onSubmit={create}>
      <input required placeholder="Name" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
      <input required placeholder="Category" value={f.category} onChange={e=>setF({...f,category:e.target.value})}/>
      <input placeholder="Emoji" value={f.image} onChange={e=>setF({...f,image:e.target.value})}/>
      <input type="number" step=".01" min="0" value={f.price} onChange={e=>setF({...f,price:e.target.value})}/>
      <input className="desc" placeholder="Description" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>
      <button className="primary">Create + seed stock</button>
    </form>}
    <div className="grid3">{filtered.map(p=>{
      const s=inventory.find(x=>Number(x.product_id)===p.id);
      return <div className="card product" key={p.id}><div className="productTop"><div className="productIcon big">{p.image||"📦"}</div><Pill tone={s?.low_stock?"amber":"green"}>{s?.available??0} in stock</Pill></div>
        <span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="productBottom"><strong>{money(p.price)}</strong><button className="primary" disabled={!s||Number(s.available)<1} onClick={()=>add(p)}>Add to cart</button></div>
      </div>
    })}</div>
  </>
}

function Panel({title,eyebrow,children}) {
  return <section className="card panel"><div className="panelHead"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>{children}</section>
}

function OrderTable({orders,pay,cancel,advance}) {
  return <div className="tableWrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Items</th><th/></tr></thead>
  <tbody>{orders.map(o=><tr key={o.id}><td><strong>#{o.id}</strong></td><td>{o.user_email}</td><td><strong>{money(o.total)}</strong></td><td><Pill tone={o.status==="PAID"?"green":o.status==="REFUNDED"?"amber":"blue"}>{o.status}</Pill></td><td>{o.items?.reduce((s,x)=>s+x.quantity,0)||0}</td><td><div className="rowActions">
    {o.status==="CREATED"&&<><button className="primary small" onClick={()=>pay(o)}>Pay</button><button className="secondary small" onClick={()=>cancel(o)}>Cancel</button></>}
    {(o.status==="PAID"||o.status==="PROCESSING")&&<button className="secondary small" onClick={()=>advance(o)}>{o.status==="PAID"?"Process":"Ship"}</button>}
  </div></td></tr>)}
  {!orders.length&&<tr><td colSpan="6" className="empty">No orders yet.</td></tr>}</tbody></table></div>
}
