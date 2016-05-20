"use strict";

var app = angular.module('eau', []);

const SONDE = 'CDC401';
const CONFIG_K = 1;
const CONFIG_DEBUT_CALCUL = 2;
const CONFIG_FIN_CALCUL = 3;
const CONFIG_INTERVALLE = 4;
const CONFIG_LIBELLE_LIEU = 5;
const INIT_DATE = 2;
const INIT_HEURE = 3;
const INIT_LIEU = 8;
const INIT_OPERATEUR = 4;
const INIT_TEMPERATURE = 11;
const INIT_MESURES = 9;

app.directive('upload', function($rootScope){
    return {
        restrict: 'E',
        scope: {callback: '='},
        template: '<input type="file" style="display: none;"></input><button type="button" class="btn btn-xs btn-primary" ng-click="openf()">{{fname}}</button><hr />',
        link: function(scope, elem, attr){
            scope.fname = 'Selectionner fichier'; //Libellé bouton d'upload/nom du fichier sélectionné
            var reader = new FileReader();
            reader.onload = (function(){
                return function(e){
                    /*
                     * callback de traitement de la lecture du fichier
                     */
                    $rootScope.$apply(
                        scope.callback(String(e.target.result))
                    );
                    }})();
            elem[0].children[0].onchange = function(){
                scope.fname = elem[0].children[0].files[0].name;
                /*
                 * lecture du fichier uploadé
                 */
                reader.readAsText(elem[0].children[0].files[0]);
            };
            scope.openf = function(){
                elem[0].children[0].click();
            };
        }
    }
});


app.controller('mainCtrl', function(){
    var selected = false;
    var self = this;
    this.intervalle = 10; // intervalle de prise de mesure
    this.qk = 0; //quantité de sel a afficher
    this.lst = [] // liste des mesures
    this.fc = 0; // borne de fin de calcul
    this.dc = 0; // borne de début de calcul
    this.c_init = 0; // conductivité initiale
    this.debit = 0; // débit
    this.item_lst = []; // liste des lignes du csv
    this.id_op = ''; // identifiant opérateur
    this.heure_session = ''; // heure de début des mesures
    this.date_session = ''; // date des mesures
    this.lieu_session = ''; // lieu de mesure
    this.svg_cnf = '';
    this.svg_data = '';
    this.releves = {};
    this.lieux = [];
    this.libelle_lieu = '';
    this.svg_rayon_point = 10;

    function getterSetter(varname){
        return function(x){
            if(x === undefined){
                return self[varname];
            }
            self[varname] = x;
            self.calc()
        }
    }

    this.k = getterSetter('qk')
    this.iv = getterSetter('intervalle');
    this.cdc = getterSetter('dc');
    this.cfc = getterSetter('fc');


    this.init = function(data){
        /*
         * retourne la liste des valeurs en pourcentages par rapport à la valeur maximale
         */
        var max = Math.max(...data);
        var out = [];
        data.forEach(function(v){
            out.push((v/max)*100);
        });
        return out;//.reverse();
    };
    
    this.collect = function(idx){
        /*
         * affecte la valeur d'idx sur dc ou fc
         */
        if(!selected){
            this.dc = idx;
        }
        else{
            this.fc = idx;
        }
        selected = !selected;
        this.calc();
    };

    this.select = function(n){
        if(n != undefined){
            selected = n==1;
        }
        return selected;
    };

    var _rowdata = '';

    var avg = function(l){
        /*
         * retourne la moyenne des valeurs de la liste fournie
         */
        var out = 0;
        l.forEach(function(v){
            //console.log(v);
            //out += parseFloat(v);
            out += v;
        });
        return out / l.length;
    };

    this.calc = function(){
        /*
         * calcule le débit en fonction des variations de conductivité
         */
        /*var _data = _rowdata.trim().split('\n').reverse().map(parseFloat);*/
        var _data = [];
        this.item_lst.forEach(function(ln){
            _data.push(parseFloat(ln[9]));
        });
        this.c_init = avg(_data.slice(0, this.dc));
        this.cm = avg(_data.slice(this.dc, this.fc))
        this.cn = this.cm-this.c_init;
        this.de = ((this.fc-this.dc)*self.intervalle);
        this.debit = (self.qk * 1860) / (this.cn * this.de);
        this.debit_max = this.debit * 1.1;
        this.debit_min = this.debit * 0.9;
    };

    this.parseUpload = function(csv_file){
        self.item_lst = [];
        self.csv_data = [];
        self.releves = {};
        self.lieux = [];
        var lines = csv_file.trim().split('\n').map(function(i){return i.split(',')});
        if(lines[0][0] == '__configuration__'){
            var config = lines.splice(0, 1)[0];
            self.parseData(lines[1][INIT_LIEU].replace(/(\(\d+\))$/, ''), config, lines);
            return
        }
        lines.forEach(function(ln){
            if(ln[5] == SONDE){
                var lieu = ln[INIT_LIEU].replace(/(\(\d+\))$/, '');
                if(!self.releves[lieu]){
                    self.lieux.push(lieu);
                    self.releves[lieu] = {config: [0,0,0,0,10,lieu], data: []};
                }
                self.releves[lieu].data.push(ln);
            }
        });

        var lieu_ = null;
        for(lieu_ in self.releves){
            self.releves[lieu_].data = self.releves[lieu_].data.reverse();
        }
    }

    this.supprim = function(idx, evt){
        this.item_lst.splice(idx, 1);
        this.lst.splice(idx, 1);
        this.refresh_svg();
        this.calc();
    }

    this.selectData = function(name){

        self.libelle_lieu = self.releves[self.lieu].config[CONFIG_LIBELLE_LIEU];
        self.parseData(lieu, self.releves[self.lieu].config, self.releves[self.lieu].data);
    }

    this.format_date = function(str){
        var dt_items = str.trim().split('-');
        var dte = new Date(dt_items[2], dt_items[1], dt_items[0]);
        var out = ('0' + dte.getDate()).substr(-2) + '/' + ('0' + (dte.getMonth() + 1)).substr(-2) + '/' + dte.getFullYear();
        return out;
        //return dte.toLocaleFormat('%d/%m/%Y');
    }

    this.parseData = function(lieu, config, data){
        /*
         * analyse le fichier csv pour en tirer les informations nécéssaires
         * fonction passée en callback de la directive d'upload
         */
        self.qk = parseInt(config[CONFIG_K]);
        self.libelle_lieu = config[CONFIG_LIBELLE_LIEU];
        self.dc = parseInt(config[CONFIG_DEBUT_CALCUL]);
        self.fc = parseInt(config[CONFIG_FIN_CALCUL]);
        self.intervalle = parseInt(config[CONFIG_INTERVALLE]);
        self.item_lst = data;

        //self.date_session = self.item_lst[0][INIT_DATE].replace(/(\d+)-(\w+)-(\d+)/, '$1 $2. $3');
        self.date_session = self.format_date(self.item_lst[0][INIT_DATE]);
        self.heure_session = self.item_lst[0][INIT_HEURE];
        self.lieu_session = self.item_lst[0][INIT_LIEU].replace(/(\(\d+\))$/, '');
        self.id_op = self.item_lst[0][INIT_OPERATEUR];
        self.temper = self.item_lst[0][INIT_TEMPERATURE];
        var mes_lst = []; 
        self.item_lst.forEach(function(x){
            mes_lst.push(parseFloat(x[INIT_MESURES]));
        });
        if(mes_lst.length<200){
            self.svg_rayon_point = 20;
        }
        else{
            self.svg_rayon_point = 10;
        }
        self.lst = self.init(mes_lst);
        self.svg_data = [];
        self.refresh_svg();
        self.calc();
    };

    this.refresh_svg = function(){
        self.svg_data = [];
        var ratio_x = 10000/self.lst.length;
        self.lst.forEach(function(y, x){
            self.svg_data.push((x*ratio_x) + ',' + (105-y)*10);
        });
    }

    this.save = function(){
        var first_line = Array(self.item_lst[0].length-1);
        ['__configuration__', self.qk, self.dc, self.fc, self.intervalle, self.libelle_lieu].forEach(function(v, k){
            first_line[k] = v;
        });
        
        var out = [first_line.join(',')];
        //self.item_lst.reverse().forEach(function(ln){
        self.item_lst.forEach(function(ln){
            var str_ln = ln.join(',');
            out.push(str_ln);
        });
        var str_out = out.join('\n');

        /*
         * creation et destruction à la volée d'une ancre pour le téléchargement de fichier
         */
        var dwn = document.createElement('a');
        dwn.setAttribute('href', 'data:text/csv,' + encodeURIComponent(str_out));
        dwn.setAttribute('download', 'calcul_' + self.date_session.replace(/\//g, '-') + '_' + self.lieu_session.trim() + '.csv');
        dwn.style.display = 'none';
        document.body.appendChild(dwn);
        dwn.click();
        document.body.removeChild(dwn);
    }
});
