const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'Invalid authorization' });
    }

    const token = authorization?.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const e = require('express');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_AUTHPHRASE}@sim-cluster.xlgii.mongodb.net/?retryWrites=true&w=majority&appName=sim-cluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const data = await usersCollection.findOne(query);
            if (data.role === 'admin') {
                next();
            } else {
                res.status(401).send({ message: 'Access forbidden' });
            }
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const data = await usersCollection.findOne(query);
            if (data.role === 'instructor') {
                next();
            } else {
                res.status(401).send({ message: 'Unauthorized forbidden' });
            }
        }

        const database = client.db("sims-master");
        const usersCollection = database.collection('users');
        const classesCollection = database.collection("classes");
        const cartCollection = database.collection("cart");
        const paymentCollection = database.collection("payment");
        const enrolledCollection = database.collection("enrolled");
        const appliedCollection = database.collection("applied");

        app.post('/api/set-token', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_SECRET, {
                expiresIn: '24h'
            })
            res.send({ token });
        })

        //user routes -------------------------------------------------------
        app.post('/new-user', async (req, res) => {
            const user = req.body;
            const data = await usersCollection.insertOne(user);
            res.status(201).send(data);
        })

        app.get('/users', async (req, res) => {
            const data = await usersCollection.find({}).toArray();
            res.send(data);
        })

        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const data = await usersCollection.findOne(query);
            res.send(data);
        })

        app.get('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const data = await usersCollection.findOne(query);
            res.send(data);
        })

        app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const data = await usersCollection.deleteOne(query);
            res.send(data);
        })

        app.put('/update-user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updatedUser = req.body;
            const filter = { _id: new ObjectId(id) };
            //options upsert true
            const updatedDoc = {
                $set: {
                    name: updatedUser.name,
                    email: updatedUser.email,
                    phone: updatedUser.phone,
                    role: updatedUser.role,
                    address: updatedUser.address,
                    about: updatedUser.about,
                    photoUrl: updatedUser.photoUrl,
                    skills: updatedUser.skills ? updatedUser.skills : null,
                }
            }
            const data = await usersCollection.updateOne(filter, updatedDoc);
            res.send(data);
        })

        // classes routes ---------------------------------------------------
        app.post('/new-class', verifyJWT, verifyInstructor, async (req, res) => {
            const body = req.body;
            const data = await classesCollection.insertOne(body);
            res.status(201).send(data);
        })

        //gives out only approved classes
        app.get('/classes', async (req, res) => {
            // const query = {status: 'approved'};
            const data = await classesCollection.find().toArray();
            res.send(data);
        })

        app.get('/popular-classes', async (req, res) => {
            const data = await classesCollection.find().toArray();
            result = []
            data.map((item) => {
                const totalSeats = item.available_seats;
                const enrolled = item.total_enrolled;
                const percentage = (enrolled / totalSeats) * 100;
                if (percentage > 50) result.push(item);
            })
            res.send(result);
        }) 

        //get classes by instructor email
        app.get('/classes/:email', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.params.email;
            const query = { instructor_email: email };
            const data = await classesCollection.find(query).toArray();
            res.send(data);
        })

        //manage classes
        app.get('/classes-manage', async (req, res) => {
            const data = await classesCollection.find().toArray();
            res.send(data);
        })

        //updating class status path method used only when few details are to be updated, use put when all to be updated
        app.patch('/change-status/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const status = req.body.status;
            const reason = req.body.reason;
            const filter = { _id: new ObjectId(id) }

            const updatedUser = {
                $set: {
                    status: status,
                    reason: reason
                }
            }
            const data = await classesCollection.updateOne(filter, updatedUser);
            res.send(data);
        })

        app.get('/approved-classes', async (req, res) => {
            const query = { status: 'approved' };
            const data = await classesCollection.find(query).toArray();
            res.send(data);
        })

        //get single class details
        app.get('/class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const data = await classesCollection.findOne(query);
            res.send(data);
        })

        app.put('/update-class/:id', verifyJWT, verifyInstructor, async (req, res) => {
            const id = req.params.id;
            const updateClass = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedUser = {
                $set: {
                    class_name: updateClass.class_name,
                    price: updateClass.price,
                    instructor: updateClass.instructor
                }
            };
            const data = await classesCollection.updateOne(filter, updatedUser);
            res.send(data);
        })

        //cart Routes -------------------------------------------------------------------

        app.post('/add-to-cart', verifyJWT, async (req, res) => {
            const cart = req.body;
            const data = cartCollection.insertOne(cart);
            res.status(201).send(data);
        })

        //get cart item
        app.get('/cart-item/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const email = req.body.email;
            const query = {
                classId: id,
                userMail: email
            }
            const projection = { classId: 1 };
            const data = await cartCollection.findOne(query, { projection: projection });
            res.send(data);
        })

        //cart info by user name
        app.get('/cart/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { userMail: email };
            const projection = { classId: 1 };
            const carts = await cartCollection.find(query, { projection: projection }).toArray();
            const classIds = carts.map(cart => new ObjectId(cart.classId));
            const query2 = { _id: { $in: classIds } };
            const data = await classesCollection.find(query2).toArray();
            res.send(data);
        });

        //delete cart item
        app.delete('/delete-cart-item/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { classId: id };
            const data = await cartCollection.deleteOne(query);
            res.send(data);
        })

        //payments routes ----------------------------------------------
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price) * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: [
                    'card'
                ]
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        //post payment info to db 
        app.post('/payment-info', verifyJWT, async (req, res) => {
            const paymentInfo = req.body;
            const classesId = paymentInfo.classesId;
            const userEmail = paymentInfo.userEmail;
            const singleClassId = req.query.classId;
            let query;
            if (singleClassId) {
                query = { classId: singleClassId, userEmail: userEmail };
            } else {
                query = { classId: { $in: classesId } };
            }

            const classesQuery = { _id: { $in: classesId.map(id => new ObjectId(id)) } };
            const classes = await classesCollection.find(classesQuery).toArray();
            const newEnrolledData = {
                userMail: userEmail,
                classesId: classesId.map(id => new ObjectId(id)),
                transactionId: paymentInfo.transactionId
            }

            const updatedDoc = {
                $set: {
                    total_enrolled: classes.reduce((total, current) => total + current.total_enrolled, 0) + 1 || 0,
                    available_seats: classes.reduce((total, current) => total + current.available_seats, 0) - 1 || 0
                }
            };

            const updatedResult = await classesCollection.updateMany(classesQuery, updatedDoc, { upsert: true });
            const enrolledData = await enrolledCollection.insertOne(newEnrolledData);
            const cartData = await cartCollection.deleteMany(query);
            const paymentInfoData = await paymentCollection.insertOne(paymentInfo);

            res.send({
                updatedResult,
                enrolledData,
                cartData,
                paymentInfoData
            });
        });

        //payment history

        app.get("/payment-history/:email", async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const data = await paymentCollection.find(query).toArray();
            res.send(data);
        })

        //payment history length
        app.get("/payment-history/:email", async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const totalData = await paymentCollection.countDocuments(query);
            res.send(totalData);
        });

        //enrollment routes
        // app.get("/popular-classes", async (req, res) => {
        //     const data = await classesCollection.find().sort({ totalEnrolled: -1}).limit(6).toArray()
        //     res.send(data);
        // })  above a different endpoint

        app.get("/popular-instructors", async (req, res) => {
            //grouping collection -> pipeline
            const pipeline = [
                {
                    $group: {
                        _id: "$instructor_email",
                        totalEnrolled: { $sum: "$total_enrolled" }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "email",
                        as: "instructor"
                    }
                },
                {
                    $match: {
                        "instructor.role": "Instructor",
                    }
                },
                {
                    $project: {
                        _id: 0,
                        instructor: {
                            $arrayElemAt: ["$instructor", 0]
                        },
                        totalEnrolled: 1
                    }
                },
                {
                    $sort: {
                        totalEnrolled: -1
                    }
                },
                {
                    $limit: 6
                }
            ];

            const data = await classesCollection.aggregate(pipeline).toArray();
            res.send(data);
        })

        //admim things
        app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
            const approvedClasses = (await classesCollection.find({ status: 'approved' }).toArray()).length;
            const pendingClasses = (await classesCollection.find({ status: 'pending' }).toArray()).length;
            const instructor = (await usersCollection.find({ role: 'instructor' }).toArray()).length;
            const totalClasses = (await classesCollection.find().toArray()).length;
            const totalEnrolled = (await enrolledCollection.find().toArray()).length;

            const data = {
                approvedClasses,
                pendingClasses,
                instructor,
                totalClasses,
                totalEnrolled
            }
            res.send(data);
        })

        //get all instructor 
        app.get('/instructors', async (req, res) => {
            const data = await usersCollection({ role: 'instructor' }).toArray();
            res.send(data);
        });

        app.get('/enrolled-classes/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { userMail: email };
            const pipeline = [
                {
                    $match: query
                },
                {
                    $lookup: {
                        from: "classes",
                        localField: "classesId", // This should match the field in the enrolled table
                        foreignField: "_id", // This should match the field in the classes table
                        as: "classes"
                    }
                },
                {
                    $unwind: "$classes" // Unwind to get individual class documents
                },
                {
                    $project: {
                        _id: 0,
                        classes: 1 // Only include class details
                    }
                }
            ];

            const data = await enrolledCollection.aggregate(pipeline).toArray();
            res.send(data);
        })

        //applied for instructor
        app.post('/ass-instructor', async (req, res) => {
            const bod = req.body;
            const data = await appliedCollection.insertOne(bod);
            res.send(data);
        })

        app.get('/applied-instructor/:email', async (req, res) => {
            const email = req.params.email;
            const data = await appliedCollection.findOne({email: email});
            res.send(data);
        })

        app.get('/applied-instructor', async (req, res) => {
            // const email = req.params.email;
            const data = await appliedCollection.find({}).toArray();
            res.send(data);
        })

        app.put('/update-applicant/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const updatedUser = req.body;
            const filter = { email: email };
            //options upsert true
            const updatedDoc = {
                $set: {
                    role: updatedUser.role,
                }
            }
            const data = await usersCollection.updateOne(filter, updatedDoc);
            res.send(data);
        })

        app.delete('/delete-appl/:email', verifyJWT, verifyAdmin, async(req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const data = await appliedCollection.deleteOne(query);
            res.send(data);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("Hello")
})

app.listen(port, () => {
    console.log(`listening on port ${port}`);
})
