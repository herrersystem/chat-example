/*
 * Mini chat Howler.
 * Author: herrersystem.
*/

var express= require('express'),
	app= express(),
	server= require('http').createServer(app),
    io= require('socket.io').listen(server),
    ent= require('ent'),
    fs= require('fs'),
    bodyParser=require('body-parser');


//Expression regulière.
const regexUrl= new RegExp(
	/[http|https|ftp]+:\/\/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi
);

//Nombre maximum de channels.
const nbrMaxChan=15;

//Nombre maximum d'utilisateurs par channel.
const nbrMaxUser=25;

//Objet Channel.
function Channel(name, maxUser){
	this.name=name;
	this.maxUser=maxUser;
	
	this.listUser=[];
	this.nbrUser=1;
}

//Liste d'objets Channels.
var listChan=[];


//Fonction de callback pour la récupération de formulaires.
var urlencodedParser=bodyParser.urlencoded({
	extended: false
});

//Définition route vers fichiers statiques.
app.use(express.static('public'));


/**** Gestion des vues ****/

//Accueil.
app.get('/', function (req, res){
	res.render('index.ejs', {
		msgInfo:''
	});
});

//Gestion du chat.
app.post('/channel', urlencodedParser, function (req, res){
	if (!req.body || !req.body.pseudo || !req.body.channel){
		res.render('index.ejs');
	}
	
	var pseudo=ent.encode(req.body.pseudo);
	var channel=ent.encode(req.body.channel);
	var pseudoAlreadyExist=false;
	var chanAlreadyExist=false;
	var maxUserAttempt=false;
	var maxChanAttempt=false;
	
	for (var i=0; i<listChan.length; i++){
		if (channel === listChan[i].name){
			chanAlreadyExist=true;
			
			for (var j=0; j<listChan[i].listUser.length; j++){
				if (listChan[i].listUser[j] == pseudo){
					pseudoAlreadyExist=true;
					break;
				}
			}
			
			if (listChan[i].nbrUser+1 > listChan[i].maxUser){
				 maxUserAttempt=true;
			}else{
				//Si le pseudo est déjà utilisé, on ajoute une extension aléatoire.
				if (pseudoAlreadyExist){
					pseudo=pseudo+String(Math.floor((Math.random() * 9999) + 1));
				}	
				listChan[i].nbrUser+=1;
				listChan[i].listUser.push(pseudo);
			}
			break;
		}
	}
	//Si le channel n'existe pas on le crée.
	if (!chanAlreadyExist){
		var indexNewChan=listChan.length;
		
		if (indexNewChan > nbrMaxChan){
			maxChanAttempt=true;
		}else{
			listChan.push(new Channel(channel, nbrMaxUser));
			listChan[indexNewChan].listUser.push(pseudo);
		}
	}
	
	if (maxChanAttempt){
		res.render('index.ejs', {
			msgInfo:'Nombre maximum de channel atteint'
		});
	}
	else if (maxUserAttempt){
		res.render('index.ejs', { 
			msgInfo:'Nombre maximum d\'utilisateur pour ce channel atteint'
		});
	}
	else{
		res.render('channel.ejs', {
			pseudo: pseudo,
			channel: channel,
			nbrMaxUser: nbrMaxUser
		});
	}
});

app.get('/channel', function (req, res){
	// On traite la requete sans renvoyer de données.
	res.writeHead(204);
	res.end();
});


/**** Gestion websocket ****/

var io=require('socket.io').listen(server);

io.sockets.on('connection', function (socket){
	
	/**** Initialisation websocket ****/
	
	//Récupération du pseudo.
	socket.pseudo=ent.encode(socket.handshake.query.pseudo);
	
	//Récupération du channel.
	var channel=ent.encode(socket.handshake.query.channel);	
	socket.channel=channel;
	socket.join(channel);
	
	//Message d'avertissement nouvelle connexion.
	socket.broadcast.to(channel).emit('infos', {
		'pseudo': socket.pseudo,
		'text': 'viens de se connecter',
		'status': true
	});
	
	var users= [];
	
	//On récupère la liste des utilisateurs du channel.
	for (var i=0; i<listChan.length; i++){
		if (channel === listChan[i].name){
			users=listChan[i].listUser;
			break;
		}
	}
	socket.emit('list', users);
	
		
	/**** Gestion des évènements ****/
	
	//Envoi message.
	socket.on('message', function (msg){
		if (msg.length >= 2){
			msg=ent.encode(msg); // Supression des balises html.
			var link=msg.match(regexUrl); // Conversion des liens en lien html.
			
			if (link){
				for (var i=0; i<link.length; i++){
					msg=msg.replace(
						link[i], 
						'<a href="'+link[i]+'" target="_blank">'+link[i]+'</a>'
					);
				}
			}	
			io.sockets.to(socket.channel).emit('message', {
				'pseudo': socket.pseudo,
				'text': msg
			});
		}
    });
    
    //Déconnexion.
    socket.on('disconnect', function(){
		//Suppression de l'utilisateur dans la liste du channel.
		for (var i=0; i<listChan.length; i++){
			
			if (socket.channel === listChan[i].name){
				for (var j=0; j<listChan[i].listUser.length; j++){
					
					if (socket.pseudo === listChan[i].listUser[j]){
						listChan[i].listUser.splice(j, 1);
						listChan[i].nbrUser-=1;
						
						break;
					}
				}
				break;
			}
		}
		
		socket.broadcast.to(socket.channel).emit('infos', {
			'pseudo': socket.pseudo,
			'text': 'viens de se déconnecter',
			'status': false
		});
	});
});

server.listen(8080);
