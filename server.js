require("dotenv").config()
const express = require("express")
const mysql = require("mysql2")
const cors = require("cors")
const multer = require("multer")
const csv = require("csv-parser")
const fs = require("fs")
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
  bench INT
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

/* ================= REGISTER ================= */

/* ================= FORGOT OTP ================= */

/* ================= RESET PASSWORD ================= */

app.post("/save-classrooms", (req, res) => {

    let { bench, rooms } = req.body

    db.query("DELETE FROM classrooms")

    rooms.forEach(room => {

        let sql = `
        INSERT INTO classrooms (room_name, row_count, col_count, bench)
        VALUES (?,?,?,?)`

        db.query(sql, [
            room.room_name,
            room.row_count,
            room.col_count,
            bench
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
    let extraRows = parseInt(req.query.rows) || 0
    let extraCols = parseInt(req.query.cols) || 0
    let extraBench = parseInt(req.query.bench) || 1

    db.query("SELECT * FROM students", (err, studentsData) => {
        if(err) return res.send("Student fetch error ❌")

        db.query("SELECT * FROM classrooms", (err, rooms) => {
            if(err) return res.send("Room fetch error ❌")

            // ✅ REMOVE DUPLICATES
            let seen = new Set()
            let students = studentsData.filter(s => {
                let reg = s.regno.trim()
                if(seen.has(reg)) return false
                seen.add(reg)
                return true
            })

            // shuffle
            students.sort(() => Math.random() - 0.5)

            let allRooms = []

            // ================= MAIN ROOMS =================
            rooms.forEach(room => {

                let grid = Array.from({ length: room.row_count }, () =>
                    Array.from({ length: room.col_count }, () =>
                        Array(room.bench || 1).fill(null)
                    )
                )

                for(let r=0; r<room.row_count; r++){
                    for(let c=0; c<room.col_count; c++){
                        for(let b=0; b<(room.bench||1); b++){

                            let placed = false

                            // ✅ STRICT (dept + subject)
                            for(let i=0; i<students.length; i++){
                                let s = students[i]

                                if(isValid(s, r, c, grid)){
                                    placeStudent(grid, r, c, b, s)
                                    students.splice(i,1)
                                    placed = true
                                    break
                                }
                            }

                            // ✅ RELAXED (only subject)
                            if(!placed){
                                for(let i=0; i<students.length; i++){
                                    let s = students[i]

                                    if(isRelaxedValid(s, r, c, grid)){
                                        placeStudent(grid, r, c, b, s)
                                        students.splice(i,1)
                                        placed = true
                                        break
                                    }
                                }
                            }
                        }
                    }
                }

                allRooms.push({
                    room: room.room_name,
                    layout: grid
                })
            })

            // ================= EXTRA ROOM =================
            if(allowExtra && students.length > 0){

                if(extraRows === 0 || extraCols === 0){
                    return res.send("Enter rows & cols for extra room ❌")
                }

                let grid = Array.from({ length: extraRows }, () =>
                    Array.from({ length: extraCols }, () =>
                        Array(extraBench).fill(null)
                    )
                )

                for(let r=0; r<extraRows; r++){
                    for(let c=0; c<extraCols; c++){
                        for(let b=0; b<extraBench; b++){

                            if(students.length === 0) break

                            let s = students.shift()

                            grid[r][c][b] = {
                                name: s.name,
                                regno: s.regno,
                                dept: s.dept,
                                subject: s.subject
                            }
                        }
                    }
                }

                allRooms.push({
                    room: "Extra",
                    layout: grid
                })
            }

            // ================= FORMAT OUTPUT =================
            let clean = allRooms.map(room => ({
                room: room.room,
                layout: room.layout.map(row =>
                    row.map(col =>
                        col.map(s =>
                            s
                            ? `${s.name}\nReg: ${s.regno}\nDept: ${s.dept}\nSub: ${s.subject}`
                            : "Empty"
                        )
                    )
                )
            }))

            // ================= ROOM DEPT LIST =================
            let roomDeptList = allRooms.map(room => {
                let deptMap = {}

                room.layout.forEach(row => {
                    row.forEach(col => {
                        col.forEach(s => {
                            if(!s) return

                            if(!deptMap[s.dept]){
                                deptMap[s.dept] = []
                            }

                            deptMap[s.dept].push(
                                `${s.name} (${s.regno} - ${s.subject})`
                            )
                        })
                    })
                })

                return {
                    room: room.room,
                    departments: deptMap
                }
            })

            // ================= FINAL RESULT =================
            let result = {
                seating: clean,
                unseated: students.map(s =>
                    `${s.name} (${s.regno} - ${s.dept} - ${s.subject})`
                ),
                roomDeptList: roomDeptList,
                created_at: new Date()
            }

            // ================= SAVE HISTORY =================
            db.query(
                "INSERT INTO seating_history (data) VALUES (?)",
                [JSON.stringify(result)],
                err => {
                    if(err) console.log("History error:", err)
                }
            )

            res.json(result)
        })
    })
})


// ================= FUNCTIONS =================

function placeStudent(grid, r, c, b, s){
    grid[r][c][b] = {
        name: s.name,
        regno: s.regno,
        dept: s.dept,
        subject: s.subject
    }
}

// STRICT (dept + subject)
function isValid(seat, r, c, grid){

    if(grid[r][c]){
        for(let n of grid[r][c]){
            if(!n) continue
            if(n.dept === seat.dept) return false
            if(n.subject === seat.subject) return false
        }
    }

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(!n) continue
                if(n.dept === seat.dept) return false
                if(n.subject === seat.subject) return false
            }
        }
    }

    return true
}

// RELAXED (only subject)
function isRelaxedValid(seat, r, c, grid){

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
app.get("/seating-history", (req, res) => {

    db.query("SELECT * FROM seating_history ORDER BY id DESC", (err, result) => {
        if(err) return res.send("Error ❌")

        let data = result.map(r => ({
    id: r.id,
    ...(typeof r.data === "string" ? JSON.parse(r.data) : r.data)
}))

        res.json(data)
    })
})
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