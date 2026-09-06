import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const app = express();
const pool = new Pool({
  connectionString: process.env.INVENTORY_DB_URL ||
    "postgres://microapp:microapp123@127.0.0.1:5432/inventory_db"
});

app.use(cors());
app.use(express.json());

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      product_id BIGINT PRIMARY KEY,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
      reorder_level INTEGER NOT NULL DEFAULT 10 CHECK(reorder_level>=0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(reserved<=quantity)
    )
  `);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM inventory");
  if (rows[0].count===0) {
    const qty=[60,45,85,25,8,120];
    for (let i=0;i<qty.length;i++) {
      await pool.query(
        "INSERT INTO inventory(product_id,quantity,reserved,reorder_level) VALUES($1,$2,0,10)",
        [i+1,qty[i]]
      );
    }
  }
}

app.get("/health", async (_req,res)=>{
  await pool.query("SELECT 1");
  res.json({service:"inventory-service",status:"UP",language:"Node.js"});
});

app.get("/inventory", async (_req,res)=>{
  const {rows}=await pool.query(`
    SELECT product_id,quantity,reserved,quantity-reserved AS available,reorder_level,
           (quantity-reserved)<=reorder_level AS low_stock,updated_at
    FROM inventory ORDER BY product_id
  `);
  res.json(rows);
});

app.get("/inventory/:productId", async (req,res)=>{
  const {rows}=await pool.query(`
    SELECT product_id,quantity,reserved,quantity-reserved AS available,reorder_level,
           (quantity-reserved)<=reorder_level AS low_stock,updated_at
    FROM inventory WHERE product_id=$1
  `,[req.params.productId]);
  if(!rows.length) return res.status(404).json({error:"inventory record not found"});
  res.json(rows[0]);
});

app.post("/inventory/:productId/adjust", async (req,res)=>{
  const productId=Number(req.params.productId);
  const delta=Number(req.body.delta);
  if(!Number.isInteger(productId)||!Number.isInteger(delta)) {
    return res.status(400).json({error:"productId and delta must be integers"});
  }
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const current=await client.query(
      "SELECT quantity,reserved FROM inventory WHERE product_id=$1 FOR UPDATE",[productId]
    );
    if(!current.rows.length){
      if(delta<0) throw new Error("cannot create inventory with negative quantity");
      await client.query(
        "INSERT INTO inventory(product_id,quantity,reserved,reorder_level) VALUES($1,$2,0,10)",
        [productId,delta]
      );
    }else{
      const next=current.rows[0].quantity+delta;
      if(next<current.rows[0].reserved) throw new Error("quantity cannot become lower than reserved stock");
      await client.query("UPDATE inventory SET quantity=$1,updated_at=NOW() WHERE product_id=$2",[next,productId]);
    }
    await client.query("COMMIT");
    const {rows}=await pool.query(`
      SELECT product_id,quantity,reserved,quantity-reserved AS available,reorder_level,
             (quantity-reserved)<=reorder_level AS low_stock,updated_at
      FROM inventory WHERE product_id=$1
    `,[productId]);
    res.json(rows[0]);
  }catch(e){
    await client.query("ROLLBACK");
    res.status(409).json({error:e.message});
  }finally{client.release();}
});

app.post("/inventory/reserve", async (req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"items are required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    for(const item of items){
      const productId=Number(item.productId??item.product_id);
      const quantity=Number(item.quantity);
      if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0){
        throw new Error("each item needs productId and positive integer quantity");
      }
      const current=await client.query(
        "SELECT quantity,reserved FROM inventory WHERE product_id=$1 FOR UPDATE",[productId]
      );
      if(!current.rows.length) throw new Error(`no inventory for product ${productId}`);
      const available=current.rows[0].quantity-current.rows[0].reserved;
      if(available<quantity) throw new Error(`insufficient stock for product ${productId}: available=${available}`);
      await client.query(
        "UPDATE inventory SET reserved=reserved+$1,updated_at=NOW() WHERE product_id=$2",
        [quantity,productId]
      );
    }
    await client.query("COMMIT");
    res.json({status:"RESERVED",items});
  }catch(e){
    await client.query("ROLLBACK");
    res.status(409).json({error:e.message});
  }finally{client.release();}
});

app.post("/inventory/release", async (req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"items are required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    for(const item of items){
      const productId=Number(item.productId??item.product_id);
      const quantity=Number(item.quantity);
      const current=await client.query(
        "SELECT reserved FROM inventory WHERE product_id=$1 FOR UPDATE",[productId]
      );
      if(!current.rows.length) throw new Error(`no inventory for product ${productId}`);
      const release=Math.min(current.rows[0].reserved,quantity);
      await client.query(
        "UPDATE inventory SET reserved=reserved-$1,updated_at=NOW() WHERE product_id=$2",
        [release,productId]
      );
    }
    await client.query("COMMIT");
    res.json({status:"RELEASED",items});
  }catch(e){
    await client.query("ROLLBACK");
    res.status(409).json({error:e.message});
  }finally{client.release();}
});


app.post("/inventory/commit", async (req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"items are required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    for(const item of items){
      const productId=Number(item.productId??item.product_id);
      const quantity=Number(item.quantity);
      const current=await client.query(
        "SELECT quantity,reserved FROM inventory WHERE product_id=$1 FOR UPDATE",[productId]
      );
      if(!current.rows.length) throw new Error(`no inventory for product ${productId}`);
      if(current.rows[0].reserved<quantity) throw new Error(`reserved stock is lower than requested commit for product ${productId}`);
      await client.query(
        "UPDATE inventory SET quantity=quantity-$1,reserved=reserved-$1,updated_at=NOW() WHERE product_id=$2",
        [quantity,productId]
      );
    }
    await client.query("COMMIT");
    res.json({status:"COMMITTED",items});
  }catch(e){
    await client.query("ROLLBACK");
    res.status(409).json({error:e.message});
  }finally{client.release();}
});

app.post("/inventory/return", async (req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"items are required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    for(const item of items){
      const productId=Number(item.productId??item.product_id);
      const quantity=Number(item.quantity);
      await client.query(
        `INSERT INTO inventory(product_id,quantity,reserved,reorder_level)
         VALUES($1,$2,0,10)
         ON CONFLICT(product_id)
         DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,updated_at=NOW()`,
        [productId,quantity]
      );
    }
    await client.query("COMMIT");
    res.json({status:"RETURNED",items});
  }catch(e){
    await client.query("ROLLBACK");
    res.status(409).json({error:e.message});
  }finally{client.release();}
});

migrate().then(()=>{
  app.listen(8083,()=>console.log("inventory-service listening on http://localhost:8083"));
}).catch(e=>{console.error(e);process.exit(1);});
