const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();

const bcrypt= require("bcrypt")
const saltRound=10;

const cookieParser= require("cookie-parser");
const session= require("express-session");

const {getUserBooks,insertData}= require('./Files/getUserBooks')
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: ["https://main--hilarious-sable-2159d8.netlify.app/"],//change this
    methods: ["GET", "POST", "*", "DELETE", "UPDATE", "PUT"],
    credentials: true,
  })
);

app.use(
  session({
    key: "userId",
    secret: "nithin@52141",
    resave: false,
    saveUninitialized: false,
    cookie: {
      expires: 60 * 60 * 24*500,//half day
      httpOnly: true,
      secure: false,
    },
  })
);

const { createPool } = require("mysql2/promise");
let connection1 = `mysql://root:1e6g-a13Dabd1FAA366hDHC2HH-EeCdb@viaduct.proxy.rlwy.net:53466/railway`;
const pool = createPool(connection1);

async function copyQuery(query){
  let connection = await pool.getConnection();
  try{
    let [data]=await connection.query(query);
    return data;
  }
  catch(err){
    throw err
  }
  finally{
    connection.release();
  }
}
async function copyExecute(setting){
  let connection = await pool.getConnection();
  try {
    let firstOption= setting.first;
    let secondOption = setting.second;
    if(firstOption&&secondOption){
      let [response] = await connection.execute(setting.sql, [setting.first,setting.second]);
      return response;
    }
    else if(firstOption&&!secondOption){
      let [response] = await connection.execute(setting.sql, [
        setting.first,
      ]);
      return response;
    }
    else{
      return {};
    }
  } catch (err) {
    throw err
  } finally {
    connection.release();
  }
}

app.post("/signIn/user", async(req, res) => {
  let userName = req.body.userName
  let password = req.body.password;
  let data = await copyQuery(`select * from user where username='${userName}';`);
  if(data.length>0){
    bcrypt.compare(password,data[0].pass,(err,response)=>{
      if(err) throw err;
      else{
        req.session.user=data;
        res.status(200).json(data)
      }
    })
  }else{
      req.session.user = null;
      res.json("error");
  }
});
app.get("/signIn/user",(req,res)=>{
  if(req.session.user){
    res.send({LoggedIn:true,user:req.session.user})
  }
  else{
    res.send({ LoggedIn: false});
  }
});

app.get("/logout",(req,res)=>{
  req.session.destroy((err)=>{
    if(err) res.status(500).json({ message: "Logout failed" });
    else{
      res.clearCookie("userId"); // Clear the session cookie
      res.status(200).json({ message: "Logout successful" });
    }
  })
})

app.get("/getUsers",async(req,res)=>{
    let response =await copyQuery('select * from user');
    res.json(response)
})

app.get("/", getUserBooks);

app.post("/", async (req, res) => {
  const input = req.body.input;
  console.log(input);
  let result;
  let response = await copyQuery(
    `select * from bookdb.books where title like '%${input}%' or author like '%${input}%'`
  );
  if(response.length<4){
    result=await insertData(input);
    let newArr= [...response,...result];
    
    res.json(newArr);
  }
  else{
    res.json(response);
  }
});


app.post("/genre/:genreid",async (req, res) => {
  let genre_name = req.params.genreid;
  let response = await copyQuery(` select * from bookdb.books b join bookdb.genres g on b.genre_id=g.genre_id where g.genre_name="${genre_name}";`)
  res.status(200).json(response);
});


app.get("/getUsers/:userInput/:currUser",async(req,res)=>{
  let userSearch= req.params.userInput;
  let currUser = req.params.currUser;
  let usersOnSearch = await copyQuery(
    `select * from user where (username like '%${userSearch}%') `
  );
  let tempFriends = await copyExecute({
    sql: `select * from user join friend_requests on user.userId=friend_requests.sender_id where  friend_requests.sender_id=?;`,
    first: currUser,
  });
  res.status(200).json({ usersOnSearch, tempFriends });
})




app.delete("/deleteRequest/:user/:receiverId",async (req,res)=>{
  let { user, receiverId } = req.params;
  await copyExecute({sql:`delete from friend_requests where sender_id=? and receiver_id=?`,first:user,second:receiverId});
  res.status(200).send("Success");
})

app.get("/requests/:reqId",async (req,res)=>{
  let connection = await pool.getConnection();
  try{
    let {reqId}= req.params;
  let sql= `select * from friend_requests where receiver_id=?`;

  //   let a=[];
  //   for(let i=0;i<data.length;i++){
  //     let sql=`select * from user where userId=${data[i].sender_id}`
  //     pool.query(sql,(err,data)=>{
  //       if(!err) {
  //         console.log(data[0]);//this log taking time 
  //         a.push(data[0]);
  //       }
  //     })
  //   }
  //   console.log(a);//this console log showing first to get rid of this i updated the all code to new promise for querying 
  //   res.json(a);

  let [freindsId]= await connection.execute(sql,[reqId]);
  console.log(freindsId);
  const usersData=freindsId.map(async (request)=>{
    let sql = `SELECT * FROM user WHERE userId = ?`
    let [usersData] = await connection.execute(sql, [request.sender_id]);
    return usersData[0]
  })
  let allUsers= await Promise.all(usersData)
  res.status(200).json({allUsers,freindsId})
  }
  catch(err) {console.log(err)}
  finally{
    connection.release();
  }
})


app.post("/accepted",async(req,res)=>{
  let{addedId,userId}= req.body;
  console.log("went");
    await copyExecute({sql:`update friend_requests set status='accepted' where receiver_id=? and sender_id=?`,first:userId,second:addedId});
    let getUser= await copyExecute({sql:`select * from friendships where user1Id=? and user2Id=?`,first:userId,second:addedId});
    if(getUser.length===0){
      await copyExecute({sql:`insert into friendships(user1Id,user2Id) values(?,?)`,first:userId,second:addedId});
    }
    res.status(200).send("Success");
  })

  app.post("/sendRequest",async (req,res)=>{
    let { user, receiverId } = req.body;
      let response = await copyExecute({sql:`select * from friend_requests where sender_id=? and receiver_id=?`,first:user,second:receiverId});
      if(response.length===0){
        await copyExecute({sql:`insert into friend_requests(sender_id,receiver_id) values(?,?)`,first:user,second:receiverId});
      }
      res.status(200).send("Success");
  })
  
  app.delete("/reject/:rejId/:userId", async (req, res) => {
    try {
    const { rejId, userId } = req.params;

    await copyQuery(
      `DELETE FROM friend_requests WHERE receiver_id=${userId} AND sender_id=${rejId}`
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error:", error);
  }
});



app.post("/addUser",(req,res)=>{
  const {img,user,pass}= req.body;
  bcrypt.hash(pass,saltRound,async(err,hash)=>{
    if(err) throw err;
    await copyQuery(`insert into user(username,pass,profile_pic) values('${user}','${hash}','${img}')`);
    res.status(200).send("Success");
  })
})

app.get("/userFriends/:userId",async(req,res)=>{
  let {userId}= req.params;
  let data= await copyExecute({sql:`select * from  user where userId in (select user2Id from friendships where user1Id=?)`,first:userId});
  let data1 = await copyExecute({
    sql: `select * from  user where userId in (select user1Id from friendships where user2Id=?)`,
    first: userId,
  });
  data.push(...data1)
  const seenUserIds = new Set();
  const uniqueData = data.filter((obj) => {
    if (!seenUserIds.has(obj.userId)) {
      seenUserIds.add(obj.userId);
      return true;
    }
    return false;
  });
  res.status(200).json(uniqueData)
})

app.delete("/deleteFriend/:userId/:friendId",async(req,res)=>{
  let {userId,friendId}= req.params;
   await copyExecute({sql:`delete from friendships where user1Id=? and user2Id=?`,first:userId,second:friendId});
   await copyExecute({sql: ` delete from friend_requests where sender_id=? and receiver_id=?`,first:friendId,second:userId});
   res.status(200).send("Success");
  })

  app.post("/userPreference", async (req, res) => {
    try {
    const { user, value, bookId } = req.body;
    console.log("went");
    let data = await copyExecute({
      sql: `select * from ${value} where userId=? and bookId=?`,
      first: user,
      second: bookId,
    });
    if (data.length === 0) {
      await copyExecute({
        sql: `insert into ${value} (bookId,userId) values(?,?) `,
        first: bookId,
        second: user,
      });
    }
    res.status(200).send("Success");
  } catch (error) {
    console.error("Error in /userPreference:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.delete("/deletepreferences/:userId/:pref/:bookId", async (req, res) => {
  try {
    const { userId, pref, bookId } = req.params;
       copyExecute({
         sql: `delete from ${pref} where userId=? and bookId=?`,
         first: userId,
         second: bookId,
        });
      res.status(200).send("Success");
  } catch (error) {
    console.error("Error in /deletepreferences:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/getPreferences/:userId/:pref/:bookId",async(req,res)=>{
  const {userId,pref,bookId}= req.params;
  let data=await copyQuery(`select * from ${pref} where userId=${userId} and bookId=${bookId}`);
  res.status(200).json(data[0])
})


app.get('/getLibrary/:table/:userId',async(req,res)=>{
  const {table,userId}= req.params;
  console.log(table,userId);
  let response = await copyExecute({
    sql: `SELECT * FROM ${table} c join books b on b.book_id=c.bookId and c.userId=? order by created_at desc`,
    first: userId,
  });
  res.status(200).json(response);
})  

app.get("/getFriendsLibrary/:table/:userId", async (req, res) => {
  const { table, userId } = req.params;
  console.log(table, userId);
  let response = await copyExecute({
    sql: `SELECT * FROM books c join ${table} b on b.bookId=c.book_id and b.userId=? order by created_at desc`,
    first: userId,
  });
  res.status(200).json(response);
});  

app.post("/addRecent", async (req, res) => {
  const { user, bookId } = req.body;
  
  try {
    await pool.query("START TRANSACTION");
    const existingData = await copyExecute({
      sql: "SELECT * FROM recently WHERE userId=? AND bookId=?",
      first: user,
      second: bookId,
    });
    
    await copyQuery(
    `DELETE r1 FROM recently r1, recently r2 WHERE r1.userId = r2.userId AND r1.bookId = r2.bookId AND r1.recentId > r2.recentId;`
    );

    if (existingData.length === 0) {
      const result = await copyExecute({
        sql: "SELECT * FROM recently WHERE userId=?",
        first: user,
      });
      console.log("a");
      if (result.length > 5) {
        await copyExecute({
          sql: `DELETE ru FROM recently ru
                JOIN (SELECT userId, created_at FROM recently WHERE userId = ? ORDER BY created_at LIMIT 1 ) subquery
                ON ru.userId = subquery.userId AND ru.created_at = subquery.created_at;`,
          first: user,
        });
      }
        console.log("b");
      await copyExecute({
        sql: "INSERT INTO recently (userId, bookId) VALUES (?, ?)",
        first: user,
        second: bookId,
      });    
      await pool.query("COMMIT");
    res.status(200).send("Success");
  } else {
    // User and book combination already exists
    await pool.query("ROLLBACK");
      res.status(200).send("Already exists");
    }
  } catch (error) {
    console.error("Error:", error);
    await pool.query("ROLLBACK");
    res.status(500).send("Internal Server Error");
  }
});

//admins


app.get('/admin/:adminId',async(req,res)=>{
  let adminId= req.params.adminId;
  let data= await copyExecute({sql:`select * from books where admin_id=?`,first:adminId});
  res.json(data)
})

app.get("/admin/book/:bookId", async(req, res) => {
  let bookId = req.params.bookId;
  let data= await copyExecute({sql:`select * from books where book_id=?`,first:bookId});
  res.json(data)
});

app.delete("/admin/:bookId", async(req, res) => {
  let bookId = req.params.bookId;
  await copyExecute({sql:`delete from books where book_id=?`,first:bookId});
});

  
  app.put("/admin/bookUpdate/:bookId",async(req,res)=>{
    let bookId= req.params.bookId;
    let {title,desc,auth,image}= req.body;
    desc = desc?.replace("'", "");
    desc = desc?.replace(/"/g, "");
  
    await copyQuery(`update books set title="${title}",book_desc="${desc}",author="${auth}",image_link="${image}" where book_id=${bookId}`);
  })
  
  app.listen(process.env.MYSQLPORT, () => {
    console.log("App is listening on port 3000");
  });

  
  // app.delete('/reject/:rejId/:userId',(req,res)=>{
    //   let {rejId,userId}= req.params;
    //   console.log(rejId,userId);
    //   let sql=`delete from friend_requests where receiver_id=${userId} and sender_id=${rejId}`
  //   pool.query(sql,(err,data)=>{
    //     if(err) throw err
    //   })
    // })
    // app.post("/userPreference", async (req, res) => {
      //   try {
        //     let { user, value, bookId } = req.body;
        //     let data = await copyExecute({
          //       sql: `select * from ${value} where userId=? and bookId=?`,
          //       first: user,
          //       second: bookId,
          //     });
          
          //     if (data.length === 0) {
            //       await copyExecute({
              //         sql: `insert into ${value} (bookId,userId) values(?,?) `,
              //         first: bookId,
              //         second: user,
              //       });
    //     }
    
    //     res.status(200).send("Success");
    //   } catch (error) {
      //     console.error("Error in /userPreference:", error);
      //     res.status(500).send("Internal Server Error");
      //   }
      // });
      // app.delete("/deletepreferences/:userId/:pref/:bookId", async (req, res) => {
        //   const { userId, pref, bookId } = req.params;
      //   await copyExecute({
        //     sql: `delete from ${pref} where userId=? and bookId=?`,
        //     first: userId,
        //     second: bookId,
    //   });
    // });
      // app.post("/userPreference", async (req, res) => {
        //   let { user, value, bookId } = req.body;
      //   console.log("went");
      //     let data = await copyExecute({
      //       sql: `select * from ${value} where userId=? and bookId=?`,
      //       first: user,
      //       second: bookId,
      //     });
      //     if (data.length === 0) {
      //      copyExecute({
        //         sql: `insert into ${value} (bookId,userId) values(?,?) `,
        //         first: bookId,
      //         second: user,
      //       });
      //     }
      // });
      // app.get("/popular", (req, res) => {
      //   let sql = `select * from bookdb.books order by rating desc;`;
      //   pool.query(sql, (err, data) => {
      //     if (!err) res.json(data);
      //   });
      // });
      
      // app.get("/recent", (req, res) => {
      //   let sql = `select * from bookdb.books order by published_date desc;`;
      //   pool.query(sql, (err, data) => {
      //     if (!err) res.json(data);
      //   });
      // });
