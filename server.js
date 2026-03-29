require("dotenv").config()
const express = require("express")
const mysql = require("mysql2")
const cors = require("cors")
const { Resend } = require("resend")
const resend = new Resend(process.env.RESEND_API_KEY)
const multer = require("multer")
const csv = require("csv-parser")
const fs = require("fs")
let otpStore = {}
const upload = multer({ dest: "uploads/" })
const app = express()
app.use(cors())
app.use(express.json())
app.get("/", (req, res) => {
    res.send("API Running ✅")
})
// DB
const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
})
db.connect(err => {
    if(err) throw err
    console.log("MySQL Connected")

    // ✅ CREATE TABLES AUTOMATICALLY

    db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fname VARCHAR(100),
            lname VARCHAR(100),
            email VARCHAR(100),
            dob DATE,
            username VARCHAR(100),
            password VARCHAR(100)
        )
    `)

    db.query(`
        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            regno VARCHAR(50),
            subject VARCHAR(50),
            dept VARCHAR(50),
            type VARCHAR(20)
        )
    `)

    db.query(`
    CREATE TABLE IF NOT EXISTS classrooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_name VARCHAR(50),
        row_count INT,
        col_count INT,
        bench INT,
        allowed_depts TEXT   -- 👈 ADD THIS
    )
`)

    db.query(`
        CREATE TABLE IF NOT EXISTS seating_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            data JSON
        )
    `)

    console.log("Tables ready ✅")
})
// MAIL

/* ================= OTP SEND ================= */
app.post("/send-otp", async (req, res) => {

    let { email } = req.body
    let otp = Math.floor(100000 + Math.random()*900000)

    // ✅ STORE OTP HERE
    otpStore[email] = {
        otp,
        time: Date.now()
    }

    try {
        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: email,
            subject: "OTP Verification",
            text: `Your OTP is: ${otp}`
        })

        res.send("OTP sent ✅")

    } catch (err) {
        console.log("MAIL ERROR:", err)
        res.send("Error sending OTP ❌")
    }
})

/* ================= REGISTER ================= */
app.post("/register", (req, res) => {

    let { fname, lname, email, dob, username, password, otp } = req.body

    // ✅ Check OTP exists
    if (!otpStore[email]) {
        return res.send("OTP not found ❌")
    }

    // ✅ Check expiry (1 min)
    if (Date.now() - otpStore[email].time > 60000) {
        delete otpStore[email]
        return res.send("OTP expired ⏱️")
    }

    // ✅ Check OTP match
    if (otpStore[email].otp != otp) {
        return res.send("Invalid OTP ❌")
    }

    // ✅ Check user exists
    let check = "SELECT * FROM users WHERE username=?"

    db.query(check, [username], (err, result) => {

        if (err) {
            return res.send("Server error ❌")
        }

        if (result.length > 0) {
            return res.send("User exists ❌")
        }

        // ✅ Insert user
        let sql = `INSERT INTO users (fname,lname,email,dob,username,password)
                   VALUES (?,?,?,?,?,?)`

        db.query(sql, [fname, lname, email, dob, username, password], (err) => {

            if (err) {
                return res.send("Error saving user ❌")
            }

            // ✅ Clear OTP after success
            delete otpStore[email]

            res.send("Registered successfully ✅")
        })
    })
})
/* ================= LOGIN ================= */
app.post("/login", (req, res) => {

    let { username, password } = req.body

    let sql = "SELECT * FROM users WHERE (username=? OR email=?) AND password=?"

db.query(sql, [username, username, password], (err, result) => {

        if(err){
            return res.json({success:false, msg:"Server error ❌"})
        }

        if(result.length > 0){
            res.json({success:true, msg:"Login success ✅"})
        }else{
            res.json({success:false, msg:"Invalid user or password ❌"})
        }
    })
})

/* ================= FORGOT OTP ================= */
app.post("/forgot-otp", async (req, res) => {

    let { email } = req.body

    let check = "SELECT * FROM users WHERE email=?"

    db.query(check, [email], async (err, result) => {

        if(err) return res.send("Server error ❌")

        if(result.length === 0){
            return res.send("Email not found ❌")
        }

        let otp = Math.floor(100000 + Math.random()*900000)

        otpStore[email] = {
            otp,
            time: Date.now()
        }

        try {
            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: email,
                subject: "Reset OTP",
                text: `Your OTP is: ${otp}`
            })

            res.send("OTP sent ✅")

        } catch (err) {
            console.log("MAIL ERROR:", err)
            res.send("Error sending OTP ❌")
        }

    })
})

/* ================= RESET PASSWORD ================= */
app.post("/reset-password", (req,res)=>{

    let { email, otp, newPassword } = req.body

    if(!otpStore[email]){
        return res.send("OTP not found ❌")
    }

    if(Date.now() - otpStore[email].time > 60000){
        delete otpStore[email]
        return res.send("OTP expired ❌")
    }

    if(otpStore[email].otp != otp){
        return res.send("Invalid OTP ❌")
    }

    let sql = "UPDATE users SET password=? WHERE email=?"

    db.query(sql, [newPassword,email], err=>{
        if(err) throw err

        delete otpStore[email]

        res.send("Password updated ✅")
    })
})

app.post("/save-classrooms", (req, res) => {

    let { bench, rooms } = req.body

    db.query("DELETE FROM classrooms")

    rooms.forEach(room => {

        let sql = `
        INSERT INTO classrooms 
        (room_name, row_count, col_count, bench, allowed_depts)
        VALUES (?,?,?,?,?)`

        db.query(sql, [
            room.room_name,
            room.row_count,
            room.col_count,
            bench,
            JSON.stringify(room.allowed_depts) // ✅ IMPORTANT
        ])
    })

    res.send("Classroom details saved ✅")
})

app.post("/upload-students", upload.fields([
    { name: "regularFile" },
    { name: "arrearFile" }
]), (req, res) => {

    let dept = req.body.dept

    let insertStudent = (filePath, type) => {
        return new Promise((resolve) => {

            let data = []

            fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row) => {
                data.push([
                    row.name,
                    row.regno,
                    row.subject || row.subcode || "NA",
                    dept,
                    type
                ])
            })
            .on("end", () => {

                data.forEach(s => {
                    db.query(
                        "INSERT INTO students (name, regno, subject, dept, type) VALUES (?,?,?,?,?)",
                        s
                    )
                })

                resolve()
            })
        })
    }

    let tasks = []

    if(req.files["regularFile"]){
        tasks.push(insertStudent(req.files["regularFile"][0].path, "regular"))
    }

    if(req.files["arrearFile"]){
        tasks.push(insertStudent(req.files["arrearFile"][0].path, "arrear"))
    }

    Promise.all(tasks).then(()=>{
        res.send("Students uploaded successfully ✅")
    })

})

/* =========================
   GENERATE SEATING API
========================= */
app.get("/generate-seating", (req, res) => {

    let allowExtra = req.query.extra === "true"

    db.query("SELECT * FROM students", (err, studentsData) => {
        if(err) return res.send("Student fetch error ❌")

        db.query("SELECT * FROM classrooms", (err, rooms) => {
            if(err) return res.send("Room fetch error ❌")

            // REMOVE DUPLICATES
            let seen = new Set()
            let students = studentsData.filter(s => {
                let reg = s.regno.trim()
                if(seen.has(reg)) return false
                seen.add(reg)
                return true
            })

            students.sort((a,b)=> a.subject.localeCompare(b.subject))

            let allRooms = []

            // ================= ROOMS =================
            rooms.forEach(room => {

                let grid = Array.from({ length: room.row_count }, () =>
                    Array.from({ length: room.col_count }, () =>
                        Array(room.bench || 1).fill(null)
                    )
                )

                let tempStudents = [...students]

                // 🔁 TRY 3 TIMES STRICT
                let solved = false
                for(let i=0;i<3;i++){
                    solved = solveSeating(grid, tempStudents, 0, {count:0}, false)
                    if(solved) break
                }

                // 🔥 FINAL TRY (ALLOW SAME SUBJECT)
                if(!solved){
                    solved = solveSeating(grid, tempStudents, 0, {count:0}, true)
                }

                // 🔥 FINAL FILL (NO EMPTY BENCH)
                for(let r=0; r<room.row_count; r++){
                    for(let c=0; c<room.col_count; c++){
                        for(let b=0; b<(room.bench || 1); b++){

                            if(tempStudents.length === 0) break

                            if(grid[r][c][b] === null){
                                grid[r][c][b] = tempStudents.shift()
                            }
                        }
                    }
                }

                students = tempStudents

                allRooms.push({
                    room: room.room_name,
                    layout: grid
                })
            })

            // ================= SUBJECT MAP =================
            let clean = allRooms.map(room => {

                let subjectMap = {}

                room.layout.forEach(row => {
                    row.forEach(col => {
                        col.forEach(s => {
                            if(!s) return

                            if(!subjectMap[s.subject]){
                                subjectMap[s.subject] = {
                                    count: 0,
                                    students: []
                                }
                            }

                            subjectMap[s.subject].count++
                            subjectMap[s.subject].students.push(s.regno)
                        })
                    })
                })

                return {
                    room: room.room,
                    subjectMap,   // ✅ for question paper
                    layout: room.layout.map(row =>
                        row.map(col =>
                            col.map(s =>
                                s
                                ? `${s.name}\nReg: ${s.regno}\nDept: ${s.dept}\nSub: ${s.subject}`
                                : "Empty"
                            )
                        )
                    )
                }
            })

            let result = {
                seating: clean,
                unseated: students.map(s =>
                    `${s.name} (${s.regno} - ${s.dept} - ${s.subject})`
                ),
                created_at: new Date()
            }

            db.query(
                "INSERT INTO seating_history (data) VALUES (?)",
                [JSON.stringify(result)]
            )

            res.json(result)
        })
    })
})


// ================= SOLVER =================
function solveSeating(grid, students, index = 0, attempts = {count:0}, allowSameSubject = false){

    if(attempts.count++ > 50000) return false

    let rows = grid.length
    let cols = grid[0].length
    let bench = grid[0][0].length

    if(index === rows * cols * bench){
        return true
    }

    let r = Math.floor(index / (cols * bench))
    let c = Math.floor((index % (cols * bench)) / bench)
    let b = index % bench

    if(grid[r][c][b] !== null){
        return solveSeating(grid, students, index + 1, attempts, allowSameSubject)
    }

    for(let i = 0; i < students.length; i++){

        let s = students[i]

        if((allowSameSubject || isSubjectSafe(s, r, c, grid)) && isDeptSafe(s, r, c, grid)){

            grid[r][c][b] = s
            students.splice(i, 1)

            if(solveSeating(grid, students, index + 1, attempts, allowSameSubject)){
                return true
            }

            grid[r][c][b] = null
            students.splice(i, 0, s)
        }
    }

    return false
}


// ================= RULES =================
function isSubjectSafe(seat, r, c, grid){

    if(grid[r][c]){
        for(let n of grid[r][c]){
            if(n && n.subject === seat.subject) return false
        }
    }

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.subject === seat.subject) return false
            }
        }
    }

    return true
}

function isDeptSafe(seat, r, c, grid){

    if(grid[r][c]){
        for(let n of grid[r][c]){
            if(n && n.dept === seat.dept) return false
        }
    }

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.dept === seat.dept) return false
            }
        }
    }

    return true
}

// ================= FUNCTIONS =================
function solveSeating(grid, students, index = 0, attempts = {count:0}){

    if(attempts.count++ > 50000) return false  // 🔥 LIMIT

    let rows = grid.length
    let cols = grid[0].length
    let bench = grid[0][0].length

    if(index === rows * cols * bench){
        return true
    }

    let r = Math.floor(index / (cols * bench))
    let c = Math.floor((index % (cols * bench)) / bench)
    let b = index % bench
if(grid[r][c][b] !== null){
    return solveSeating(grid, students, index + 1, attempts)
}
    for(let i = 0; i < students.length; i++){

        let s = students[i]

        if(isSubjectSafe(s, r, c, grid)&&isDeptSafe(s, r, c, grid)){

            grid[r][c][b] = s
            students.splice(i, 1)

            if(solveSeating(grid, students, index + 1, attempts)){
                return true
            }

            // backtrack
            grid[r][c][b] = null
            students.splice(i, 0, s)
        }
    }

    return false
}
function isSubjectSafe(seat, r, c, grid){

    if(grid[r][c]){
        for(let n of grid[r][c]){
            if(n && n.subject === seat.subject) return false
        }
    }

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.subject === seat.subject) return false
            }
        }
    }

    return true
}
function isDeptSafe(seat, r, c, grid){

    // SAME BENCH
    if(grid[r][c]){
        for(let n of grid[r][c]){
            if(n && n.dept === seat.dept) return false
        }
    }

    // ADJACENT
    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.dept === seat.dept) return false
            }
        }
    }

    return true
}
function placeStudent(grid, r, c, b, s){
    grid[r][c][b] = {
        name: s.name,
        regno: s.regno,
        dept: s.dept,
        subject: s.subject
    }
}

app.delete("/delete-history/:id", (req, res) => {

    let id = req.params.id

    db.query("DELETE FROM seating_history WHERE id = ?", [id], (err) => {
        if(err) return res.send("Error deleting ❌")

        res.send("History deleted ✅")
    })
})
app.delete("/delete-all-students", (req, res) => {

    db.query("DELETE FROM students", (err) => {
        if(err) return res.send("Error deleting students ❌")

        res.send("All students deleted ✅")
    })
})
app.delete("/delete-all-classrooms", (req, res) => {

    db.query("DELETE FROM classrooms", (err) => {
        if(err) return res.send("Error deleting classrooms ❌")

        res.send("All classrooms deleted ✅")
    })
})
app.delete("/reset-all", (req, res) => {

    db.query("DELETE FROM students", (err) => {
        if(err) return res.send("Error clearing students ❌")

        db.query("DELETE FROM classrooms", (err) => {
            if(err) return res.send("Error clearing classrooms ❌")

            db.query("DELETE FROM seating_history", (err) => {
                if(err) return res.send("Error clearing history ❌")

                res.send("System fully reset ✅")
            })
        })
    })
})
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log("Server running on port " + PORT)
})