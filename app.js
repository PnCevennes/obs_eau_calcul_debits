"use strict";

var app = angular.module('eau', []);

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
    this.lst = [] // liste des mesures
    this.fc = 0; // borne de fin de calcul
    this.dc = 0; // borne de début de calcul
    this.k = 0; // quantité de sel ajoutée
    this.iv = 10; // intervalle de prise de mesure
    this.c_init = 0; // conductivité initiale
    this.debit = 0; // débit
    this.item_lst = []; // liste des lignes du csv
    this.id_op = ''; // identifiant opérateur
    this.heure_session = ''; // heure de début des mesures
    this.date_session = ''; // date des mesures
    this.lieu_session = ''; // lieu de mesure
    this.svg_cnf = '';
    this.svg_data = '';



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
        this.de = ((this.fc-this.dc)*this.iv);
        this.debit = (this.k * 1860) / (this.cn * this.de);
        this.debit_max = this.debit * 1.1;
        this.debit_min = this.debit * 0.9;
    };

    this.parseUpload = function(csv_file){
        /*
         * analyse le fichier csv pour en tirer les informations nécéssaires
         * fonction passée en callback de la directive d'upload
         */
        var item_lst = [];
        var item_total = [];
        csv_file.trim().split('\n').forEach(function(ln){
            var item = ln.split(',');
            item_total.push(item);
            if(item[5] == 'CDC401'){
                item_lst.push(item);
            }
        });
        if(item_total[0][0] == '__configuration__'){
            var config = item_total[0];
            self.k = parseInt(config[1]);
            self.dc = parseInt(config[2]);
            self.fc = parseInt(config[3]);
            self.iv = parseInt(config[4]);
        }
        self.item_lst = item_lst.reverse();

        self.date_session = self.item_lst[0][2].replace(/(\d+)-(\w+)-(\d+)/, '$1 $2. $3');
        self.heure_session = self.item_lst[0][3];
        self.lieu_session = self.item_lst[0][8].replace(/(\(\d+\))$/, '');
        self.id_op = self.item_lst[0][4];
        self.temper = self.item_lst[0][11];
        var mes_lst = []; 
        self.item_lst.forEach(function(x){
            mes_lst.push(parseFloat(x[9]));
        });
        self.lst = self.init(mes_lst);
        self.svg_data = [];
        var ratio_x = 8000/self.lst.length;
        self.lst.forEach(function(y, x){
            self.svg_data.push((x*ratio_x) + ',' + (105-y)*10);
        });
        self.calc();
    };

    this.save = function(){
        var first_line = Array(self.item_lst[0].length-1);
        ['__configuration__', self.k, self.dc, self.fc, self.iv].forEach(function(v, k){
            first_line[k] = v;
        });
        
        var out = [first_line.join(',')];
        self.item_lst.reverse().forEach(function(ln){
            var str_ln = ln.join(',');
            out.push(str_ln);
        });
        var str_out = out.join('\n');

        /*
         * creation et destruction à la volée d'une ancre pour le téléchargement de fichier
         */
        var dwn = document.createElement('a');
        dwn.setAttribute('href', 'data:text/csv,' + encodeURIComponent(str_out));
        dwn.setAttribute('download', 'calcul_' + self.item_lst[0][2] + '_' + self.lieu_session.trim() + '.csv');
        dwn.style.display = 'none';
        document.body.appendChild(dwn);
        dwn.click();
        document.body.removeChild(dwn);
    }
});
