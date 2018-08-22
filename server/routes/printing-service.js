const {app, admin, emailer, stripe} = require("../../app");
const fs = require('fs');
const PRINTING_SERVICE_URL = "http://localhost:3001/"
const {emailFooter } = require("../../email-templates");
const UIDGenerator = require('uid-generator');
const uidGenerator = new UIDGenerator();


//LOW PRIORITY NOTE: Want to rename ordered prints to just models, makes more sense, do later, but not high priortiy
app.post('/order_print',  (req,res) => {


 
    let file = req.files.model;

    
    //Hmm. I'd prefer it to be uid, so it's unique, so maybe I should reverse this to do firestore first, then upload to storage
    //I mean either way cancel if other fails.
    
    let filePath = "ModelTempHold/"+file.name;
    file.mv(filePath);
   //It shouldn't be based on local path, preview does not include current directory.

    //Uploads file into storage in queue Postfixed by orderer incase of repeated model names.
    //Okay, but what if same user uploads? Then I actually need uid generator, instead. Again, SMALL chance works.
    //I could use the doc key, okay instead of reverse. No cause then what is my reference? reference will be the uid I genreate.
    const modelId = uidGenerator.generate();
    admin.storage().bucket().upload(filePath,{destination: "3DPrinterQueue/"+file.name+"_"+body.orderer+"_"+modelId})
      .then(resolution => {


        const body = req.body;
        const queueRef = admin.firestore().collection("PrinterServiceInfo").doc("OrderedPrints").collection("Queue");
        

        const docRef = queueRef.doc();
        var startTime = "TBD";
        var endTime = "TBD";  
        var duration = "TBD";
        var cost = "TBD";

        //So primary foreign key for model in storage is(name,uid,modelId);
        docRef.set({
            'name' : file.name,
            'cost' : cost,
            'duration' : duration,
            'color' : body.color,
            'dimensions' : body.dimensions,
            'start' : startTime,
            'end' : endTime,
            'started' : false,
            'orderTime' : new Date(),
            'orderer' : body.orderer,
            'modelId' : modelId,
         

        })
        .then( result => {
            const orderId = docRef.id;

                admin.auth().getUser(body.orderer)
                .then((user) => {

                    console.log("ordering user", user);
                      //Send id back to there, and to emailer.
                    const linkToOrder = PRINTING_SERVICE_URL + "/" + body.orderer + "/orders/" + orderId
                    const mailOptions = {

                        from: process.env.NOTIFIER_EMAIL,
                        to: user.email, 
                        subject: "CES Printing Service Order Summary(Order#"+orderId+")",
                        html: "<p>Hello, " + user.displayName + "</p><br>" + 
                        "<p>Your order has been processed. We will notify you when information on your print has been updated.</p><br><br>" + 
                        "<p> Click <a href='"+ linkToOrder + "'> here </a> to manage your order </p>" + 
                        emailFooter
                    };

                    emailer.sendMail(mailOptions)
                        .then( val => {
                            console.log("email sent");
                        })
                        .catch( err => {

                            console.log("failed to eamil");
                            //Log tha failed and need to manually send the email.
                            //Need to work on making a good logger.
                        })
                    
                    res.send({orderId:docRef.id});
                    
                })
                .catch( err => {
                    //If failed to add record, then delete it and send error back so they can restart process
                    admin.storage().bucket("3DPrinterQueue/"+file.name+"_"+body.orderer+"_"+modelId).delete();

                    //Null if it failed. Client side will respond accordingly.
                    res.send({orderId:null});
                    
                })
          
            //This can happen before email finally sent, slight delay is fine versus longer load time on order.

            //Removes the model from temporary.
            fs.unlink(filePath, () => {
               // console.log("removed from temp.");
            });
        })
        .catch(err => {

        })
  

      })
      .catch(err => {
        console.log(err);
      });
});


app.post("/update-print-order", (req, res) => {

    
    const orderInfo = req.body;
   
    const dbRef = admin.firestore().collection("PrinterServiceInfo").doc("OrderedPrints").collection("Queue")
      .doc(orderInfo.orderId);

    //For their options in reciept.
    orderInfo.confirmedPurchase = false;

    const orderId = orderInfo.orderId;

    //Delete it cause don't need to save as field in database, only needed for 
    delete orderInfo.orderId;

    dbRef.update(
      orderInfo,
    )
    .then (resolution => {
      
        //After it's updated, email the user that ordered it.
        admin.auth().getUser(orderInfo.orderer,)
          .then (user => {

                const userEmail = user.email;
                   
                const link =  "'"+ PRINTING_SERVICE_URL + "/" + orderInfo.orderer + "/orders/"+orderId + "'";

                const mailOptions = {

                    from: process.env.NOTIFIER_EMAIL,
                    to:userEmail,
                    subject:"Your 3DPrint order #" + orderId + " has been updated.",
                    html: "<p> Hello </p> <br> <p> Your order to print your model " + order.name + " has been updated</p>" + 
                    "<p> Click <a href = "+link+">here<a/> to view your order's status" +
                    "<br><br> " + emailFooter
                }
                emailer.sendMail(mailOptions)
                    .then( resolved => {

                        console.log("email sent");
                        res.send({success:true});

                        
                    })
                    .catch( err => {

                        console.log("err", err);
                          res.send({error: err});

                    });

          })
          .catch (err =>{

             res.send({error:err});
          })

    })
    .catch( err => {

        console.log(err);

        res.send({error:"Failed to update order information, please try again"});
    })

});


app.post('/charge', async (req, res) => {

    try {

        const body = req.body;

        const {order, stripeToken} = body;

        
        let {status} = await stripe.charges.create({
            amount: order.cost,
            currency: "usd",
            description: "An example charge",
            source: stripeToken.id,
        });

        //After it charges, then send email notification.
        const user = await admin.auth().getUser(order.orderer)

        if (user == null){

            res.json({status});

            //again notify that email wasn't sent. And need to do manuallys
            //JUst logging probably
        }

        const userEmail = user.email;

        const emailOptions = {
            
            from: proccess.env.NOTIFIER_EMAIL,
            to: userEmail,
                    //Should be there, wait no orderId is the key, I removed it from data, I'll re add it upon pulling
                    //for the chargeing page.
            subject: "You have been charged for your print order#"+order.id,
                    //Show it here, I'll start making html template strings 
            html: "<p> Hello,"  + user.displayName +" </p><br>" +
                  "<p>Your ordered print is ready. Come pick up in room 140 at Cogswell College.</p>" + 
                  "<b> Please bring some form of identification </b><br>" +
                  emailFooter,

            };

        emailer.sendMail(emailOptions)
            .then(val => {
                                    
                console.log("email sent");
                        
                res.json({status});
                    
            })
                    
            .catch(err => {

                        
                console.log(err)
                        //Then log to let officer know need to email manually.
                    
            })

            
           
      
        res.json({status});

    } catch (err) {

      console.log("error thrown", err);
      res.status(500).end();
    }


});



app.post('/pop_queue', (req,res) => {

    const fileToRemove = req.file;
    const removing = fileToRemove.Name;
    const uid = req.user.uid;

    //Cause orders of models as well.
    const queueRef = admin.firebase.firestore().collection("PrinterServiceInfo").doc("OrderedPrints").collection("Queue");
    
    const docRef = queueRef.doc(uid + "_" + removing);


    docRef.delete()
    .then(val => {

        const printerQueueRef = admin.storage().bucket("3DPrinterQueue");
        const fileRef = printerQueueRef.file(removing);
        
        res.send(
          {
            name:removing,
            data:fileRef,
          });

        admin.storage().bucket("3DPrinterQueue/"+removing).delete()
        .then(val => {

        })
        .catch(err => {

            //Set it back to what it was, atomicity.
            docRef.set(fileToRemove);
        })

    })
    .catch(err => {
    });
   
  });

  /*Possible problems with this: I'm assuming the model is still in queue, not neccesarrily true.*/
  /*But IT IS VERY LIKELY TO BE TRUE, here is flow:
  Option 1: order print, given option to share. Guaranteed to be in queue
  Option 2: print confirmed purchase, option to share. Guaranteed to be in queue if do before popping when finished.
  Actually if do that would be better to place in a "finished" folder. Granted could store physical space of that,
  and print the information instead of keep using memory for it. I could do finished folder, actually still might do that
  so people can see their past purchases. How should I store that shit? Man this is literally E Commerce.
  Storage would get passive to keep track of order history in storage. I could have order history just be description,
  but not the model itself. I"ll keep that in physical storage in sd card or something not storage.*/

  //People will share models after placing an order or after confirming the purchase, either way 
  //Order indo will be loaded in on client side then will be passed into here.
  app.post("/share-print", async (req, res) => {

    const body = req.body;


    //I don't want to force people to print to share.
    //Or should share and upload model be different?
    //Shared could be own category of shared prints
    //then uploaded models could be just models people have. It's called printing service though so former makes sense.
    const sharingUser = body.user;

    const order = body.order;
    const modelUid = order.name+"_"+order.orderer+"_"+order.modelId;

    const storageRef = admin.storage();
    const queueBucketRef = storageRef.bucket("3DPrinterQueue");
    const sharedModelBucketRef = storageRef.bucket("SharedPrints");
    const modelRef = queueBucketRef.file(modelUid);


    //Copies file.
    //Will be the exact same name.
    modelRef.copy(sharedModelBucketRef.file(modelUid))
        .then( response =>{

            console.log("model shared");
            console.log("response", response);

            //Then if copied right, the user profile inventory also needs to be updated.

            //How credit goes is this, let's say someone printing using someone else's model. It shows model used
            //and shows the print itself and settings used.
            //Each user has a Prints Collection readiy available, each Print will have an attribute for whether or not it's shared
            //Object is print, property is whether or not it is shared. It's like inheritence vs composition, don't need deeper
            //sub directory.
            const printRef = admin.firestore().collection("users").doc(order.orderer).collection("Prints").doc(modelUid);

            await printRef.update({
                shared:true,
            });
            

            res.send({shared:true});
        })
        .catch( err => {

            console.log("error",err);
            res.send({shared:false});
        });


});

//Difference between shareing and posting is posting model, doesn't mean it has been printed.
//Though not having this in would limit what's there, I think would be good option
app.post("/share-model", (req, res) => {


    const uid = req.body.user;
    const uploadInfo = req.body.uploadInfo;

    const model = req.files.model;

    const rootBucket = admin.storage().bucket();
    
    const userRef = admin.firestore().collection("users").doc(uid);
    const uploadedModelsRef = userRef.collection("UploadedModels");


    //Don't need model id, here, most just add the extra number if alrdy exists, so I'll do that.
    //Better than just letting them upload same, and ppl won't know diff based on name, that would be confusing
    //on th eux side.

    const filePath = "ModelTempHold"+model.name;
    const modelId = model.name+"_"+uid;
    model.mv(filePath);

    await rootBucket.upload(filePath,{destination:"SharedModels/"+modelId})

        .then(file => {


            //Uploads info on shared model with ref to file in storage.
            uploadedModelsRef.doc()
                .set({

                    //This will unwrap, maybe not best cause doesn't say what it's supposed to set to
                    //but for saving time fine.
                    ...uploadInfo,
                    'modelRef': modelId,
                })
                .then( worked => {

                    res.send({success});
                })
                .catch( err => {

                    console.log(err);
                    await sharedBucket.file(filePath).delete();
                    res.send({error:"Failed to create record of upload"});
                })

        })
        .catch(err => {

            console.log("failed to upload model", err);
            res.send({error:"Failed to upload"});
        })

        //Awaits for upload to finish, fail or not, before unlinking
        fs.unlink(filePath);

});
